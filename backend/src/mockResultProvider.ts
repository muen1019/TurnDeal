import { contractFile } from "./paths.js";
import { readFileSync } from "node:fs";

import type {
  DocumentBundle,
  NormalizedIntent,
  Offer,
  RankedOffer,
  RequestSnapshot,
  SellerAgent
} from "./types.js";
import { HttpError } from "./httpError.js";

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
  "status" | "intent" | "seller_agents" | "discovery_exclusions" | "sponsored_placement" | "offers" | "ranked_offers" | "confirmation_offer_ids" | "error"
>;

const fixture = JSON.parse(
  readFileSync(contractFile("fixtures/result-sellers.v0.2.json"), "utf8")
) as SellersFixture;

export function trustedProducts(): Product[] {
  return fixture.sellers.flatMap((seller) => seller.products);
}

// Deliberately bounded demo grammar; unrecognized conditions require clarification.
export function normalizeIntent(documents: DocumentBundle): NormalizedIntent {
  const text = `${documents.intent_md}\n${documents.preference_md}`.toLowerCase();
  const budgets = [...text.matchAll(/(?:預算|budget|under|twd|nt\$)\s*(?:改成|為|:|：)?\s*(?:twd|nt\$)?\s*(\d+)/g)].map(m=>Number(m[1]));
  const days = [...text.matchAll(/(\d+)\s*(?:天|days?)/g)].map(m=>Number(m[1]));
  const disabled = /(?:不要|不接受|禁止|不含)\s*(?:任何)?(?:滑鼠墊|配件|贈品)|(?:no|without)\s+(?:accessories|add-ons|mouse pad)/.test(text);
  const free = /(?:可以|可)?接受免費|free related accessories are okay|free mouse pad/.test(text);
  const clarify = () => {throw new HttpError(400,'needs_clarification','Demo needs a wireless mouse, one explicit TWD budget and delivery limit; use the documented supported example.',['intent_md','preference_md']);};
  if(!/無線滑鼠|wireless(?: silent)?(?: black)? mouse/.test(text) || !budgets.length || !days.length || new Set(budgets).size!==1 || new Set(days).size!==1 || budgets[0]<1 || days[0]<1 || (disabled && free)) return clarify();
  let rest=text;
  const phrases=[
    /buying intent|find a wireless mouse suitable for daily office work|preferences and limits|prefer comfort and price|accept a free mouse pad|do not accept paid add-ons/g,
    /(?:預算|budget|under|twd|nt\$)\s*(?:改成|為|:|：)?\s*(?:twd|nt\$)?\s*\d+/g,
    /\d+\s*(?:天|days?)/g,
    /(?:不接受|不要|不含)付費(?:加購|配件)/g,
    /(?:不要|不接受|禁止|不含)\s*(?:任何)?(?:滑鼠墊|配件|贈品)/g,
    /(?:可以|可)?接受免費滑鼠墊/g,
    /(?:no|without)\s+(?:accessories|add-ons|mouse pad)/g,
    /free related accessories are okay|free mouse pad|no paid add-ons/g,
    /本次購買需求|購買意圖|偏好與限制|購買需求|偏好|尋找適合日常辦公的|辦公用|無線滑鼠|靜音|黑色|小尺寸|左右對稱|元|含稅運|含稅|含運|內到貨|內送達|到貨|價格優先|優先考慮舒適度與價格/g,
    /preferences|request|wireless|silent|black|mouse|including tax and shipping|delivery within|prefer|small|and|symmetrical|price first/g,
    /[\s#.,，。:：;；、！!()（）-]/g
  ];
  for(const phrase of phrases) rest=rest.replace(phrase,'');
  if(rest.trim()) return clarify();
  const product_preferences: NormalizedIntent['product_preferences']=[];
  if(/黑色|black/.test(text)) product_preferences.push({preference_id:'color_black',strength:'required',source_text:/黑色/.test(text)?'黑色':'black',attribute:'color',operator:'in',values:['black']});
  if(/小尺寸|small/.test(text)) product_preferences.push({preference_id:'size_small',strength:'preferred',source_text:/小尺寸/.test(text)?'小尺寸':'small',attribute:'size_class',operator:'in',values:['small']});
  return {category:'mouse',max_total_twd:budgets[0],delivery_days_max:days[0],required_features:/靜音|silent/.test(text)?['wireless','silent_click']:['wireless'],preferences:['price_first'],product_preferences,negotiation_policy:disabled?{bundle_mode:'disabled',allowed_addon_categories:[],max_addon_increment_twd:0}:{bundle_mode:'related_no_extra_cost',allowed_addon_categories:['mouse_pad'],max_addon_increment_twd:0}};
}

export function runDemoPipeline(requestId: string, documents: DocumentBundle, now: Date): PipelineResult {
  let intent: NormalizedIntent;
  try { intent = normalizeIntent(documents); }
  catch { return {status:'needs_clarification',intent:null,seller_agents:[],discovery_exclusions:[],sponsored_placement:null,offers:[],ranked_offers:[],confirmation_offer_ids:[],error:{code:'needs_clarification',message:'示範支援：辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。配件可填「不要滑鼠墊」或「可接受免費滑鼠墊」。未知或互相矛盾的條件請先澄清。',fields:['intent_md','preference_md']}}; }
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  const finalOffers: Offer[] = [];
  const sellerAgents: SellerAgent[] = [];

  for (const seller of fixture.sellers.filter((item) => item.enabled)) {
    const primary = seller.products.find((product) => product.category === "mouse");
    if (!primary) {
      continue;
    }

    const roundOneId = `${requestId}:${offerIdForSeller(seller, false, 1)}`;
    const roundTwoStandaloneId = `${requestId}:${offerIdForSeller(seller, false, 2)}`;
    const roundTwoOfferIds = [roundTwoStandaloneId];
    const candidate = {
      product_id: primary.product_id,
      attributes: primary.attributes,
      matched_preference_ids: intent.product_preferences.map(p=>p.preference_id),
      unmatched_preference_ids: [],
      pending_checks: []
    };

    const historical = buildStandaloneOffer(seller, primary, roundOneId, 1, expiresAt, intent);
    historical.eligibility = {status: "rejected", reason_codes: ["invalid_offer"]};
    finalOffers.push(historical);
    const standalone = buildStandaloneOffer(seller, primary, roundTwoStandaloneId, 2, expiresAt, intent);
    if(primary.stock<1) standalone.eligibility={status:"rejected",reason_codes:["invalid_offer"]};
    finalOffers.push(standalone);

    if (seller.strategy.bundle_mode === "free_optional_mouse_pad") {
      const addon = seller.products.find((product) => product.category === "mouse_pad");
      if (addon && addon.stock>0 && primary.stock>0) {
        const bundleId = `${requestId}:${offerIdForSeller(seller, true, 2)}`;
        roundTwoOfferIds.push(bundleId);
        finalOffers.push(buildBundleOffer(seller, primary, addon, standalone.offer_id, bundleId, expiresAt, intent));
      }
    }

    sellerAgents.push({
      seller_id: seller.seller_id,
      name: seller.name,
      listing_rank: sellerAgents.length + 1,
      match_reason: `${seller.name} has a matching wireless silent mouse.`,
      candidate_products: [candidate],
      trust: seller.trust,
      status: "offered",
      rounds: [
        { round: 1, outcome: "offered", offer_ids: [roundOneId] },
          { round: 2, outcome: "offered", offer_ids: roundTwoOfferIds as SellerAgent["rounds"][number]["offer_ids"] }
      ],
      final_offer_ids: roundTwoOfferIds as SellerAgent["final_offer_ids"]
    });
  }

  const rankedOffers = rankOffers(finalOffers);
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
    offers: finalOffers,
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

export function verifyTrustedOffer(offer: Offer, documents: DocumentBundle): boolean {
  const seller=fixture.sellers.find(s=>s.seller_id===offer.seller_id && s.enabled);
  if(!seller) return false;
  const products=offer.items.map(i=>seller.products.find(p=>p.product_id===i.product_id && p.category===i.category));
  if(products.some((p,i)=>!p || p.stock<offer.items[i].quantity)) return false;
  const primary=products[0]!;
  if(primary.category!=='mouse' || primary.terms_id!==offer.terms_id || JSON.stringify(primary.features)!==JSON.stringify(offer.primary_features)) return false;
  if(offer.total_price_twd!==primary.list_price_twd-seller.strategy.round_2_discount_twd || offer.delivery_days!==Math.max(...products.map(p=>p!.delivery_days))) return false;
  if(offer.variant==='bundle' && (seller.strategy.bundle_mode!=='free_optional_mouse_pad' || !offer.optional_addons || offer.items[1]?.role!=='addon')) return false;
  const intent=normalizeIntent(documents);
  return eligibilityFor(offer.total_price_twd,offer.delivery_days,primary.features,intent,offer.variant==='bundle').status==='eligible';
}

function offerIdForSeller(seller: Seller, bundle: boolean, round: 1 | 2): string {
  if (seller.seller_id === "seller_a") return `offer_a_r${round}`;
  if (seller.seller_id === "seller_b") return `offer_b_r${round}`;
  if (seller.seller_id === "seller_c" && bundle) return `offer_c_bundle_r${round}`;
  if (seller.seller_id === "seller_c") return round === 2 ? "offer_c_standalone_r2" : "offer_c_r1";
  return `${seller.seller_id}_r${round}`;
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
    items: [{ product_id: primary.product_id, category: "mouse", role: "primary", quantity: 1 }] as Offer["items"],
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
  const missing = intent.required_features.some((feature) => !features.includes(feature));
  if (missing) reasonCodes.push("missing_feature");
  if (price > intent.max_total_twd) reasonCodes.push("over_budget");
  if (deliveryDays > intent.delivery_days_max) reasonCodes.push("delivery_too_late");
  if (isBundle) {
    if (intent.negotiation_policy.bundle_mode === "disabled") {
      reasonCodes.push("bundle_disabled");
    } else {
      reasonCodes.push("related_bundle", "no_extra_cost");
    }
  }

  const hardFailures = reasonCodes.filter((code) => !["related_bundle", "no_extra_cost"].includes(code));
  return {
    status: hardFailures.length === 0 ? "eligible" : "rejected",
    reason_codes: reasonCodes as Offer["eligibility"]["reason_codes"]
  };
}

function rankOffers(offers: Offer[]): RankedOffer[] {
  return offers
    .filter((offer) => offer.eligibility.status === "eligible")
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
      reason: offer.variant === "bundle" ? "Adds a related mouse pad at no extra cost." : `TWD ${offer.total_price_twd}, delivery in ${offer.delivery_days} day(s).`,
      tradeoffs: offer.delivery_days > 3 ? ["Lower price with slower delivery."] : ["Higher price buys faster delivery."]
    }));
}
