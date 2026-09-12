import { readFileSync } from "node:fs";

import { HttpError } from "./httpError.js";
import type {
  DocumentBundle,
  NormalizedIntent,
  Offer,
  RankedOffer,
  RequestSnapshot,
  SellerAgent
} from "./types.js";

type Product = {
  product_id: string;
  category: "mouse" | "mouse_pad";
  features: string[];
  attributes: {
    size_class: string | null;
    color: string | null;
    shape: string | null;
    length_mm: number | null;
    width_mm: number | null;
    height_mm: number | null;
  };
  list_price_twd: number;
  stock: number;
  delivery_days: number;
  terms_id: string;
};

type Seller = {
  seller_id: string;
  name: string;
  enabled: boolean;
  strategy: {
    type: string;
    round_1_discount_twd: number;
    round_2_discount_twd: number;
    bundle_mode: string;
  };
  trust: SellerAgent["trust"];
  products: Product[];
};

type SellersFixture = {
  sellers: Seller[];
  campaigns: Array<{
    campaign_id: string;
    seller_id: string;
    enabled: boolean;
    target_category: "mouse";
    starts_at: string;
    ends_at: string;
  }>;
};

type PipelineResult = Pick<
  RequestSnapshot,
  | "status"
  | "intent"
  | "seller_agents"
  | "discovery_exclusions"
  | "sponsored_placement"
  | "offers"
  | "ranked_offers"
  | "confirmation_offer_ids"
  | "error"
>;

const fixture = JSON.parse(
  readFileSync(new URL("../../contracts/fixtures/result-sellers.v0.2.json", import.meta.url), "utf8")
) as SellersFixture;

export function trustedProducts(): Product[] {
  return fixture.sellers.flatMap((seller) => seller.products);
}

export function normalizeIntent(documents: DocumentBundle): NormalizedIntent {
  const text = `${documents.intent_md}\n${documents.preference_md}`;
  const normalized = normalizeText(text);
  const budget = latestBudget(normalized);
  const deliveryDays = latestDeliveryDays(normalized);

  if (!mentionsMouse(normalized) || !mentionsWireless(normalized) || budget === null || deliveryDays === null) {
    throw clarification("Demo needs an explicit wireless mouse request, TWD budget, and delivery limit.", [
      "intent_md",
      "preference_md"
    ]);
  }

  if (mentionsUnsupportedProduct(normalized)) {
    throw clarification("This demo supports wireless mouse purchases only.", ["intent_md"]);
  }

  return {
    category: "mouse",
    max_total_twd: budget,
    delivery_days_max: deliveryDays,
    required_features: (mentionsSilent(normalized) ? ["wireless", "silent_click"] : ["wireless"]) as NormalizedIntent["required_features"],
    preferences: deriveRankingPreferences(normalized),
    product_preferences: deriveProductPreferences(normalized),
    negotiation_policy: disablesFreeAccessories(normalized)
      ? {
          bundle_mode: "disabled",
          allowed_addon_categories: [],
          max_addon_increment_twd: 0
        }
      : {
          bundle_mode: "related_no_extra_cost",
          allowed_addon_categories: ["mouse_pad"],
          max_addon_increment_twd: 0
        }
  };
}

export function runDemoPipeline(requestId: string, documents: DocumentBundle, now: Date): PipelineResult {
  let intent: NormalizedIntent;
  try {
    intent = normalizeIntent(documents);
  } catch {
    return {
      status: "needs_clarification",
      intent: null,
      seller_agents: [],
      discovery_exclusions: [],
      sponsored_placement: null,
      offers: [],
      ranked_offers: [],
      confirmation_offer_ids: [],
      error: {
        code: "needs_clarification",
        message: "Please provide a wireless mouse request with a TWD budget and delivery limit.",
        fields: ["intent_md", "preference_md"]
      }
    };
  }

  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  const offers: Offer[] = [];
  const sellerAgents: SellerAgent[] = [];

  for (const seller of fixture.sellers.filter((item) => item.enabled)) {
    const primary = seller.products.find((product) => product.category === "mouse");
    if (!primary) continue;

    const roundOneId = scopedOfferId(requestId, seller, false, 1);
    const roundTwoStandaloneId = scopedOfferId(requestId, seller, false, 2);
    const roundOne = buildStandaloneOffer(seller, primary, roundOneId, 1, expiresAt, intent);
    roundOne.eligibility = { status: "rejected", reason_codes: ["invalid_offer"] };
    offers.push(roundOne);

    const roundTwoOfferIds = [roundTwoStandaloneId];
    const standalone = buildStandaloneOffer(seller, primary, roundTwoStandaloneId, 2, expiresAt, intent);
    if (primary.stock < 1) standalone.eligibility = { status: "rejected", reason_codes: ["invalid_offer"] };
    offers.push(standalone);

    if (seller.strategy.bundle_mode === "free_optional_mouse_pad") {
      const addon = seller.products.find((product) => product.category === "mouse_pad");
      if (addon && addon.stock > 0 && primary.stock > 0) {
        const bundleId = scopedOfferId(requestId, seller, true, 2);
        roundTwoOfferIds.push(bundleId);
        offers.push(buildBundleOffer(seller, primary, addon, standalone.offer_id, bundleId, expiresAt, intent));
      }
    }

    const matchedPreferenceIds = matchingPreferenceIds(primary, intent);
    sellerAgents.push({
      seller_id: seller.seller_id,
      name: seller.name,
      listing_rank: sellerAgents.length + 1,
      match_reason: `${seller.name} has a matching wireless mouse.`,
      candidate_products: [
        {
          product_id: primary.product_id,
          attributes: primary.attributes,
          matched_preference_ids: matchedPreferenceIds,
          unmatched_preference_ids: intent.product_preferences
            .map((preference) => preference.preference_id)
            .filter((preferenceId) => !matchedPreferenceIds.includes(preferenceId)),
          pending_checks: []
        }
      ],
      trust: seller.trust,
      status: "offered",
      rounds: [
        { round: 1, outcome: "offered", offer_ids: [roundOneId] },
        { round: 2, outcome: "offered", offer_ids: roundTwoOfferIds as SellerAgent["rounds"][number]["offer_ids"] }
      ],
      final_offer_ids: roundTwoOfferIds as SellerAgent["final_offer_ids"]
    });
  }

  const rankedOffers = rankOffers(offers);
  const activeCampaign = fixture.campaigns.find(
    (campaign) =>
      campaign.enabled &&
      Date.parse(campaign.starts_at) <= now.getTime() &&
      Date.parse(campaign.ends_at) > now.getTime()
  );

  return {
    status: rankedOffers.length > 0 ? "awaiting_user" : "no_match",
    intent,
    seller_agents: sellerAgents,
    discovery_exclusions: [],
    sponsored_placement: activeCampaign
      ? { seller_id: activeCampaign.seller_id, campaign_id: activeCampaign.campaign_id, label: "Sponsored" }
      : null,
    offers,
    ranked_offers: rankedOffers,
    confirmation_offer_ids: [],
    error:
      rankedOffers.length > 0
        ? null
        : {
            code: "no_match",
            message: "No eligible offer matched the current request.",
            fields: []
          }
  };
}

export function reviseDocuments(documents: DocumentBundle, feedback: string): DocumentBundle {
  const normalized = normalizeText(feedback);
  if (!normalized || normalized === "ambiguous" || normalized === "???") {
    throw clarification("Feedback needs a concrete budget, delivery, accessory, or product preference change.", ["feedback"]);
  }

  const budget = latestBudget(normalized);
  const deliveryDays = latestDeliveryDays(normalized);
  const disablesAccessories = disablesFreeAccessories(normalized);
  const noPaidAddonsOnly = rejectsPaidAddonsOnly(normalized);
  const productPreferences = deriveProductPreferences(normalized);

  if (budget === null && deliveryDays === null && !disablesAccessories && !noPaidAddonsOnly && productPreferences.length === 0) {
    throw clarification("Feedback needs a concrete budget, delivery, accessory, or product preference change.", ["feedback"]);
  }

  const lines = ["", "", "## 本次購買需求回饋", feedback.trim()];
  if (budget !== null) lines.push(`Budget: TWD ${budget} including tax and shipping.`);
  if (deliveryDays !== null) lines.push(`Delivery: within ${deliveryDays} days.`);
  if (disablesAccessories) lines.push("Accessories: disabled.");
  if (noPaidAddonsOnly) lines.push("Paid add-ons: not allowed; no-extra-cost related gifts remain allowed.");

  return {
    revision: documents.revision + 1,
    intent_md: `${documents.intent_md}${lines.join("\n")}`,
    preference_md: documents.preference_md
  };
}

export function verifyTrustedOffer(offer: Offer, documents: DocumentBundle): boolean {
  const seller = fixture.sellers.find((item) => item.seller_id === offer.seller_id && item.enabled);
  if (!seller) return false;

  const products = offer.items.map((item) =>
    seller.products.find((product) => product.product_id === item.product_id && product.category === item.category)
  );
  if (products.some((product, index) => !product || product.stock < offer.items[index].quantity)) return false;

  const primary = products.find((product) => product?.category === "mouse");
  if (!primary || primary.terms_id !== offer.terms_id || JSON.stringify(primary.features) !== JSON.stringify(offer.primary_features)) {
    return false;
  }

  const expectedDiscount = offer.round === 1 ? seller.strategy.round_1_discount_twd : seller.strategy.round_2_discount_twd;
  const expectedPrice = primary.list_price_twd - expectedDiscount;
  if (offer.total_price_twd !== expectedPrice || offer.delivery_days !== Math.max(...products.map((product) => product!.delivery_days))) {
    return false;
  }

  if (offer.variant === "bundle" && (seller.strategy.bundle_mode !== "free_optional_mouse_pad" || !offer.optional_addons)) {
    return false;
  }

  const intent = normalizeIntent(documents);
  return eligibilityFor(offer.total_price_twd, offer.delivery_days, primary.features, intent, offer.variant === "bundle").status === "eligible";
}

function buildStandaloneOffer(
  seller: Seller,
  primary: Product,
  offerId: string,
  round: 1 | 2,
  expiresAt: string,
  intent: NormalizedIntent
): Offer {
  const discount = round === 1 ? seller.strategy.round_1_discount_twd : seller.strategy.round_2_discount_twd;
  const price = primary.list_price_twd - discount;
  return {
    offer_id: offerId,
    seller_id: seller.seller_id,
    round,
    variant: "standalone",
    baseline_offer_id: null,
    items: [{ product_id: primary.product_id, category: "mouse", role: "primary", quantity: 1 }],
    primary_features: primary.features as Offer["primary_features"],
    total_price_twd: price,
    delivery_days: primary.delivery_days,
    terms_id: primary.terms_id,
    optional_addons: false,
    expires_at: expiresAt,
    eligibility: eligibilityFor(price, primary.delivery_days, primary.features, intent, false)
  };
}

function buildBundleOffer(
  seller: Seller,
  primary: Product,
  addon: Product,
  baselineOfferId: string,
  offerId: string,
  expiresAt: string,
  intent: NormalizedIntent
): Offer {
  const price = primary.list_price_twd - seller.strategy.round_2_discount_twd;
  return {
    offer_id: offerId,
    seller_id: seller.seller_id,
    round: 2,
    variant: "bundle",
    baseline_offer_id: baselineOfferId,
    items: [
      { product_id: primary.product_id, category: "mouse", role: "primary", quantity: 1 },
      { product_id: addon.product_id, category: "mouse_pad", role: "addon", quantity: 1 }
    ],
    primary_features: primary.features as Offer["primary_features"],
    total_price_twd: price,
    delivery_days: Math.max(primary.delivery_days, addon.delivery_days),
    terms_id: primary.terms_id,
    optional_addons: true,
    expires_at: expiresAt,
    eligibility: eligibilityFor(price, Math.max(primary.delivery_days, addon.delivery_days), primary.features, intent, true)
  };
}

function eligibilityFor(
  price: number,
  deliveryDays: number,
  features: string[],
  intent: NormalizedIntent,
  isBundle: boolean
): Offer["eligibility"] {
  const reasonCodes: string[] = [];
  if (intent.required_features.some((feature) => !features.includes(feature))) reasonCodes.push("missing_feature");
  if (price > intent.max_total_twd) reasonCodes.push("over_budget");
  if (deliveryDays > intent.delivery_days_max) reasonCodes.push("delivery_too_late");
  if (isBundle) {
    if (intent.negotiation_policy.bundle_mode === "disabled") reasonCodes.push("bundle_disabled");
    else reasonCodes.push("related_bundle", "no_extra_cost");
  }

  const hardFailures = reasonCodes.filter((code) => !["related_bundle", "no_extra_cost"].includes(code));
  return {
    status: hardFailures.length === 0 ? "eligible" : "rejected",
    reason_codes: reasonCodes as Offer["eligibility"]["reason_codes"]
  };
}

function rankOffers(offers: Offer[]): RankedOffer[] {
  return offers
    .filter((offer) => offer.round === 2 && offer.eligibility.status === "eligible")
    .sort((left, right) => {
      const price = left.total_price_twd - right.total_price_twd;
      if (price !== 0) return price;
      const delivery = left.delivery_days - right.delivery_days;
      if (delivery !== 0) return delivery;
      if (left.variant !== right.variant) return left.variant === "standalone" ? -1 : 1;
      return left.offer_id.localeCompare(right.offer_id);
    })
    .map((offer, index) => ({
      rank: index + 1,
      offer_id: offer.offer_id,
      reason:
        offer.variant === "bundle"
          ? "Includes a related mouse pad at no extra cost."
          : `TWD ${offer.total_price_twd}, delivery in ${offer.delivery_days} day(s).`,
      tradeoffs: (offer.delivery_days > 3 ? ["Lower price with slower delivery."] : ["Higher price buys faster delivery."]) as RankedOffer["tradeoffs"]
    }));
}

function scopedOfferId(requestId: string, seller: Seller, bundle: boolean, round: 1 | 2): string {
  return `${requestId}:${baseOfferId(seller, bundle, round)}`;
}

function baseOfferId(seller: Seller, bundle: boolean, round: 1 | 2): string {
  if (seller.seller_id === "seller_a") return `offer_a_r${round}`;
  if (seller.seller_id === "seller_b") return `offer_b_r${round}`;
  if (seller.seller_id === "seller_c" && bundle) return `offer_c_bundle_r${round}`;
  if (seller.seller_id === "seller_c") return round === 2 ? "offer_c_standalone_r2" : "offer_c_r1";
  return `${seller.seller_id}_r${round}`;
}

function matchingPreferenceIds(product: Product, intent: NormalizedIntent): string[] {
  return intent.product_preferences
    .filter((preference) => {
      if (preference.attribute === "color" || preference.attribute === "size_class" || preference.attribute === "shape") {
        const value = product.attributes[preference.attribute];
        return preference.operator === "in" ? value !== null && preference.values.includes(value) : !value || !preference.values.includes(value);
      }
      if (!("min" in preference)) return false;
      const value = product.attributes[preference.attribute];
      return value !== null && (preference.min === null || value >= preference.min) && (preference.max === null || value <= preference.max);
    })
    .map((preference) => preference.preference_id);
}

function latestRequirementsText(text: string): string {
  const markers = ["本次購買需求", "本次购买需求", "latest request", "current request", "feedback"];
  let start = -1;
  const lower = text.toLowerCase();
  for (const marker of markers) {
    const index = lower.lastIndexOf(marker.toLowerCase());
    if (index > start) start = index;
  }
  return start >= 0 ? text.slice(start) : text;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[一二兩两三四五六七八九十]/g, (char) => String(chineseDigitValue(char)))
    .toLowerCase();
}

function latestBudget(text: string): number | null {
  const patterns = [
    /(?:預算|预算|budget|under|低於|不超過|含稅運|含税运|含運|含运|twd|nt\$|ntd|台幣|臺幣)\D{0,12}(\d{2,5})/g,
    /(?:twd|nt\$|ntd)\s*(\d{2,5})/g,
    /(\d{2,5})\s*(?:元|塊|块|twd|ntd)\s*(?:含稅運|含税运|含運|含运|以內|以内|內|内)?/g
  ];
  return latestNumberMatch(text, patterns);
}

function latestDeliveryDays(text: string): number | null {
  const patterns = [
    /(\d{1,2})\s*(?:天|日|days?)\s*(?:內|内|以內|以内|到貨|到货|delivery)?/g,
    /(?:delivery|到貨|到货|寄達|送達)\D{0,12}(\d{1,2})\s*(?:天|日|days?)/g
  ];
  return latestNumberMatch(text, patterns);
}

function latestNumberMatch(text: string, patterns: RegExp[]): number | null {
  let latest: { index: number; value: number } | null = null;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > 0 && (!latest || match.index! >= latest.index)) {
        latest = { index: match.index!, value };
      }
    }
  }
  return latest?.value ?? null;
}

function mentionsMouse(text: string): boolean {
  return /滑鼠|鼠标|mouse/.test(text);
}

function mentionsWireless(text: string): boolean {
  return /無線|无线|wireless/.test(text);
}

function mentionsSilent(text: string): boolean {
  return /靜音|静音|silent/.test(text);
}

function mentionsUnsupportedProduct(text: string): boolean {
  return /鍵盤|键盘|keyboard|耳機|耳机|headphone|螢幕|屏幕|monitor/.test(text);
}

function disablesFreeAccessories(text: string): boolean {
  if (rejectsPaidAddonsOnly(text)) return false;
  return /不要配件|不需要配件|不要滑鼠墊|不需要滑鼠墊|不要鼠标垫|不需要鼠标垫|只要滑鼠|只要鼠标|accessories:\s*disabled|no accessories|without accessories|no mouse pad|without mouse pad/.test(
    text
  );
}

function rejectsPaidAddonsOnly(text: string): boolean {
  return /不要付費加購|不要付费加购|不付費加購|不付费加购|no paid add-?ons?/.test(text);
}

function deriveRankingPreferences(text: string): NormalizedIntent["preferences"] {
  const preferences: NormalizedIntent["preferences"] = [];
  if (/價格|价钱|便宜|預算|预算|price|budget|cheap/.test(text)) preferences.push("price_first");
  if (/快|急|最快|delivery|ship|到貨|到货/.test(text)) preferences.push("delivery_first");
  if (/評價|评价|信任|trust|rating/.test(text)) preferences.push("trust_first");
  return preferences;
}

function deriveProductPreferences(text: string): NormalizedIntent["product_preferences"] {
  const preferences: NormalizedIntent["product_preferences"] = [];
  if (/黑色|黑的|black/.test(text)) {
    preferences.push({
      preference_id: "color_black",
      strength: /必須|必须|required|must/.test(text) ? "required" : "preferred",
      source_text: /black/.test(text) ? "black" : "黑色",
      attribute: "color",
      operator: "in",
      values: ["black"]
    });
  }
  if (/小型|小尺寸|小滑鼠|小鼠标|small/.test(text)) {
    preferences.push({
      preference_id: "size_small",
      strength: /必須|必须|required|must/.test(text) ? "required" : "preferred",
      source_text: /small/.test(text) ? "small" : "小型",
      attribute: "size_class",
      operator: "in",
      values: ["small"]
    });
  }
  if (/對稱|对称|左右手|symmetrical/.test(text)) {
    preferences.push({
      preference_id: "shape_symmetrical",
      strength: /必須|必须|required|must/.test(text) ? "required" : "preferred",
      source_text: /symmetrical/.test(text) ? "symmetrical" : "對稱",
      attribute: "shape",
      operator: "in",
      values: ["symmetrical"]
    });
  }
  return preferences;
}

function chineseDigitValue(char: string): number {
  const values: Record<string, number> = {
    一: 1,
    二: 2,
    兩: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  return values[char] ?? Number.NaN;
}

function clarification(message: string, fields: string[]): HttpError {
  return new HttpError(422, "feedback_requires_clarification", message, fields);
}
