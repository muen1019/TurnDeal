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
  floor_price_twd: number;
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
    round_discounts_twd: number[];
    final_round: number | null;
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
  readFileSync(contractFile("fixtures/sellers.json"), "utf8")
) as SellersFixture;

export function trustedProducts(): Product[] {
  return fixture.sellers.flatMap((seller) => seller.products);
}

// Deliberately bounded demo grammar; unrecognized conditions require clarification.
export function normalizeIntent(documents: DocumentBundle): NormalizedIntent {
  const text = `${documents.intent_md}\n${documents.preference_md}`.toLowerCase();
  const budgets = [...text.matchAll(/(?:預算|含稅運|budget|under|twd|nt\$)\s*(?:改成|為|:|：)?\s*(?:twd|nt\$)?\s*(\d+)/g)].map(m=>Number(m[1]));
  const days = [...text.matchAll(/(\d+)\s*(?:天|days?)/g)].map(m=>Number(m[1]));
  const disabled = /(?:不要|不接受|禁止|不含)\s*(?:任何)?(?:滑鼠墊|配件|贈品)|(?:no|without)\s+(?:accessories|add-ons|mouse pad)/.test(text);
  const free = /(?:可以|可)?接受免費|free related accessories are okay|free mouse pad/.test(text);
  const clarify = () => {throw new HttpError(400,'needs_clarification','Demo needs a wireless mouse, one explicit TWD budget and delivery limit; use the documented supported example.',['intent_md','preference_md']);};
  if(!/無線(?:靜音)?滑鼠|wireless(?: silent)?(?: black)? mouse/.test(text) || !budgets.length || !days.length || new Set(budgets).size!==1 || new Set(days).size!==1 || budgets[0]<1 || days[0]<1 || (disabled && free)) return clarify();
  let rest=text;
  const phrases=[
    /可接受不加價且可拒絕的滑鼠墊|只接受黑色|元內|及/g,
    /buying intent|find a wireless mouse suitable for daily office work|preferences and limits|prefer comfort and price|accept a free mouse pad|do not accept paid add-ons/g,
    /(?:預算|含稅運|budget|under|twd|nt\$)\s*(?:改成|為|:|：)?\s*(?:twd|nt\$)?\s*\d+/g,
    /\d+\s*(?:天|days?)/g,
    /(?:不接受|不要|不含)付費(?:加購|配件)/g,
    /(?:不要|不接受|禁止|不含)\s*(?:任何)?(?:滑鼠墊|配件|贈品)/g,
    /(?:可以|可)?接受免費滑鼠墊/g,
    /(?:no|without)\s+(?:accessories|add-ons|mouse pad)/g,
    /free related accessories are okay|free mouse pad|no paid add-ons/g,
    /本次購買需求|購買意圖|偏好與限制|購買需求|偏好|尋找適合日常辦公的|辦公用|無線(?:靜音)?滑鼠|靜音|黑色|小尺寸|左右對稱|元|含稅運|含稅|含運|內到貨|內送達|到貨|價格優先|優先考慮舒適度與價格/g,
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
  const offers: Offer[] = [], sellerAgents: SellerAgent[] = [];
  const exclusions: RequestSnapshot['discovery_exclusions'] = [];
  for (const seller of fixture.sellers.filter(s => s.enabled)) {
    if (sellerAgents.length === 5) break;
    const finalRound = seller.strategy.final_round ?? 5;
    const candidates = seller.products.filter(p => p.category === 'mouse' && p.stock > 0 &&
      requiredPreferencesMatch(p,intent) && eligibilityFor(priceFor(seller,p,finalRound),p.delivery_days,p.features,intent,false).status === 'eligible');
    const primary = candidates[0];
    if (!primary) continue;
    const rounds: SellerAgent['rounds'] = [];
    let finalIds: string[] = [];
    for(let round=1;round<=finalRound;round++) {
      const id = `${requestId}:${offerIdForSeller(seller,false,round)}`;
      const standalone = buildStandaloneOffer(seller,primary,id,round,expiresAt,intent);
      const published: Offer[] = [standalone];
      const addon = seller.products.find(p=>p.category==='mouse_pad' && p.stock>0);
      if(seller.strategy.bundle_mode==='free_optional_mouse_pad' && addon) {
        published.push(buildBundleOffer(seller,primary,addon,id,`${requestId}:${offerIdForSeller(seller,true,round)}`,expiresAt,intent,round));
      }
      const ids=published.map(o=>o.offer_id);
      if(round<finalRound) for(const offer of published) offer.eligibility={status:'rejected',reason_codes:['invalid_offer']};
      offers.push(...published);
      rounds.push({round:round as Offer['round'],outcome:'offered',is_final:seller.strategy.final_round===round,offer_ids:ids});
      finalIds=ids;
    }
    sellerAgents.push({seller_id:seller.seller_id,name:seller.name,listing_rank:sellerAgents.length+1,
      match_reason:`${seller.name} has a catalog product matching the requested constraints.`,
      candidate_products:candidates.map(product=>({product_id:product.product_id,attributes:product.attributes,
        matched_preference_ids:intent.product_preferences.filter(p=>preferenceMatches(product,p)).map(p=>p.preference_id),
        unmatched_preference_ids:intent.product_preferences.filter(p=>!preferenceMatches(product,p)).map(p=>p.preference_id),pending_checks:[]})),
      trust:seller.trust,status:'offered',rounds,stop_reason:seller.strategy.final_round===null?'max_rounds':'seller_final',final_offer_ids:finalIds});
  }
  const rankedOffers=rankOffers(offers);
  const campaign=fixture.campaigns.find(c=>c.enabled && sellerAgents.some(s=>s.seller_id===c.seller_id) && Date.parse(c.starts_at)<=now.getTime() && Date.parse(c.ends_at)>now.getTime());
  return {status:rankedOffers.length?'awaiting_user':'no_match',intent,seller_agents:sellerAgents,discovery_exclusions:exclusions,
    sponsored_placement:campaign?{seller_id:campaign.seller_id,campaign_id:campaign.campaign_id,label:'Sponsored'}:null,
    offers,ranked_offers:rankedOffers,confirmation_offer_ids:[],error:rankedOffers.length?null:{code:'no_match',message:'No eligible catalog offer matches all constraints.',fields:[]}};
}

function preferenceMatches(product:Product, preference:NormalizedIntent['product_preferences'][number]) {
  const value=product.attributes[preference.attribute as keyof Product['attributes']];
  if(preference.operator==='in')return preference.values.includes(String(value));
  if(preference.operator==='not_in')return !preference.values.includes(String(value));
  return false;
}
function requiredPreferencesMatch(product:Product,intent:NormalizedIntent) {
  return intent.product_preferences.filter(p=>p.strength==='required').every(p=>preferenceMatches(product,p));
}
function priceFor(seller:Seller,product:Product,round:number) {
  return Math.max(product.floor_price_twd,product.list_price_twd-seller.strategy.round_discounts_twd[round-1]);
}

export function verifyTrustedOffer(offer: Offer, documents: DocumentBundle): boolean {
  const seller=fixture.sellers.find(s=>s.seller_id===offer.seller_id && s.enabled);
  if(!seller || offer.round!==(seller.strategy.final_round??5))return false;
  const primary=seller.products.find(p=>p.product_id===offer.items[0]?.product_id && p.category==='mouse');
  if(!primary || primary.stock<1 || offer.items.some(i=>i.quantity!==1))return false;
  const intent=normalizeIntent(documents);
  if(!requiredPreferencesMatch(primary,intent))return false;
  let expected=buildStandaloneOffer(seller,primary,offer.offer_id,offer.round,offer.expires_at,intent);
  if(offer.variant==='bundle') {
    const addon=seller.products.find(p=>p.product_id===offer.items[1]?.product_id && p.category==='mouse_pad' && p.stock>0);
    if(!addon || seller.strategy.bundle_mode!=='free_optional_mouse_pad' || !offer.baseline_offer_id)return false;
    expected=buildBundleOffer(seller,primary,addon,offer.baseline_offer_id,offer.offer_id,offer.expires_at,intent,offer.round);
  }
  return expected.eligibility.status==='eligible' && JSON.stringify(expected)===JSON.stringify(offer);
}

function offerIdForSeller(seller: Seller, bundle: boolean, round: number): string {
  if (seller.seller_id === "seller_a") return `offer_a_r${round}`;
  if (seller.seller_id === "seller_b") return `offer_b_r${round}`;
  if (seller.seller_id === "seller_c" && bundle) return `offer_c_bundle_r${round}`;
  if (seller.seller_id === "seller_c") return `offer_c_standalone_r${round}`;
  return `${seller.seller_id}_r${round}`;
}

function buildStandaloneOffer(
  seller: Seller,
  primary: Product,
  offerId: string,
  round: number,
  expiresAt: string,
  intent: NormalizedIntent
): Offer {
  const price = priceFor(seller,primary,round);
  return {
    offer_id: offerId,
    seller_id: seller.seller_id,
    round: round as Offer['round'],
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
  intent: NormalizedIntent,
  round: number
): Offer {
  const price = priceFor(seller,primary,round);
  return {
    offer_id: offerId,
    seller_id: seller.seller_id,
    round: round as Offer['round'],
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
