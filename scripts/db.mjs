import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(root, "data");
const databasePath = path.join(dataDirectory, "offermesh.sqlite");
const migrationPath = path.join(root, "db", "migrations", "001_initial.sql");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function json(value) {
  return JSON.stringify(value);
}

function insertMarketplaceSources(db, marketplace) {
  const insert = db.prepare(`
    INSERT INTO marketplace_sources (
      source_id, snapshot_id, marketplace, source_type, product_key, title, url,
      retrieved_at, observed_at, freshness, availability, price_amount,
      price_currency, includes_tax, includes_shipping, facts_json, notes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const source of marketplace.sources) {
    insert.run(
      source.source_id,
      marketplace.snapshot_id,
      source.marketplace,
      source.source_type,
      source.product_key,
      source.title,
      source.url,
      source.retrieved_at,
      source.observed_at,
      source.freshness,
      source.availability,
      source.price?.amount ?? null,
      source.price?.currency ?? null,
      source.price?.includes_tax ?? null,
      source.price?.includes_shipping ?? null,
      json(source.facts),
      json(source.notes),
    );
  }
}

function insertCatalog(db, sellerStore) {
  const insertTerms = db.prepare(`
    INSERT INTO terms (terms_id, warranty_months, return_days, payment_obligation)
    VALUES (?, ?, ?, ?)
  `);
  for (const terms of sellerStore.terms) {
    insertTerms.run(terms.terms_id, terms.warranty_months, terms.return_days, terms.payment_obligation);
  }

  const insertSeller = db.prepare(`
    INSERT INTO sellers (
      seller_id, name, enabled, strategy_type, round_1_discount_twd,
      round_2_discount_twd, bundle_mode, personal_band, personal_rating,
      personal_count, marketplace_rating, marketplace_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (
      product_id, category, brand, model, name, features_json,
      attributes_json, source_price_twd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProductSource = db.prepare(`
    INSERT INTO product_sources (product_id, source_id) VALUES (?, ?)
  `);
  const insertInventory = db.prepare(`
    INSERT INTO seller_inventory (
      seller_id, product_id, list_price_twd, floor_price_twd,
      stock, delivery_days, terms_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const seller of sellerStore.sellers) {
    insertSeller.run(
      seller.seller_id,
      seller.name,
      Number(seller.enabled),
      seller.strategy.type,
      seller.strategy.round_1_discount_twd,
      seller.strategy.round_2_discount_twd,
      seller.strategy.bundle_mode,
      seller.trust.personal_band,
      seller.trust.personal_rating,
      seller.trust.personal_count,
      seller.trust.marketplace_rating,
      seller.trust.marketplace_count,
    );

    for (const product of seller.products) {
      insertProduct.run(
        product.product_id,
        product.category,
        product.brand,
        product.model,
        product.name,
        json(product.features),
        json(product.attributes),
        product.source_price_twd,
      );
      for (const sourceId of product.source_ids) {
        insertProductSource.run(product.product_id, sourceId);
      }
      insertInventory.run(
        seller.seller_id,
        product.product_id,
        product.list_price_twd,
        product.floor_price_twd,
        product.stock,
        product.delivery_days,
        product.terms_id,
        sellerStore.generated_at,
      );
    }
  }

  const insertCampaign = db.prepare(`
    INSERT INTO campaigns (
      campaign_id, seller_id, enabled, target_category,
      bid_twd, starts_at, ends_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const campaign of sellerStore.campaigns) {
    insertCampaign.run(
      campaign.campaign_id,
      campaign.seller_id,
      Number(campaign.enabled),
      campaign.target_category,
      campaign.bid_twd,
      campaign.starts_at,
      campaign.ends_at,
    );
  }
}

function insertCanonicalFlow(db, happy) {
  const requestId = happy.snapshot.request_id;
  const userId = "user_demo_001";
  const createdAt = happy.now;
  const updatedAt = happy.evaluator_input.evaluated_at;

  db.prepare(`
    INSERT INTO users (user_id, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, "Demo Buyer", createdAt, updatedAt);

  db.prepare(`
    INSERT INTO requests (
      request_id, user_id, parent_request_id, revision, intent_md,
      preference_md, normalized_intent_json, status,
      published_snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requestId,
    userId,
    happy.snapshot.parent_request_id,
    happy.request.documents.revision,
    happy.request.documents.intent_md,
    happy.request.documents.preference_md,
    json(happy.snapshot.intent),
    happy.snapshot.status,
    json(happy.snapshot),
    createdAt,
    updatedAt,
  );

  const insertRequestSeller = db.prepare(`
    INSERT INTO request_sellers (
      request_id, seller_id, listing_rank, match_reason,
      candidate_products_json, status, final_offer_ids_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const seller of happy.snapshot.seller_agents) {
    insertRequestSeller.run(
      requestId,
      seller.seller_id,
      seller.listing_rank,
      seller.match_reason,
      json(seller.candidate_products),
      seller.status,
      json(seller.final_offer_ids),
    );
  }

  const insertRound = db.prepare(`
    INSERT INTO negotiation_rounds (
      request_id, seller_id, round, outcome, buyer_message,
      seller_message, drafts_json, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const negotiation of happy.negotiations) {
    for (const round of negotiation.rounds) {
      insertRound.run(
        requestId,
        negotiation.seller_id,
        round.result.round,
        round.result.outcome,
        round.buyer_message,
        round.seller_message,
        json(round.result.drafts),
        createdAt,
        updatedAt,
      );
    }
  }

  const insertOffer = db.prepare(`
    INSERT INTO offers (
      offer_id, request_id, seller_id, round, variant, baseline_offer_id,
      items_json, primary_features_json, total_price_twd, delivery_days,
      terms_id, optional_addons, expires_at, eligibility_status,
      eligibility_reason_codes_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const offers = [...happy.snapshot.offers].sort((a, b) => Number(a.variant === "bundle") - Number(b.variant === "bundle"));
  for (const offer of offers) {
    insertOffer.run(
      offer.offer_id,
      requestId,
      offer.seller_id,
      offer.round,
      offer.variant,
      offer.baseline_offer_id,
      json(offer.items),
      json(offer.primary_features),
      offer.total_price_twd,
      offer.delivery_days,
      offer.terms_id,
      Number(offer.optional_addons),
      offer.expires_at,
      offer.eligibility.status,
      json(offer.eligibility.reason_codes),
      updatedAt,
    );
  }

  db.prepare(`
    INSERT INTO evaluations (
      evaluation_id, request_id, provider, model, evaluated_at,
      input_json, ranked_offers_json, output_valid, validation_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "evaluation_demo_001",
    requestId,
    "openai",
    "fixture-structured-output",
    happy.evaluator_input.evaluated_at,
    json(happy.evaluator_input),
    json(happy.evaluator_output.ranked_offers),
    1,
    null,
  );
}

export function initializeDatabase(db) {
  const marketplace = readJson("contracts/fixtures/marketplace-source-snapshot.json");
  const sellerStore = readJson("contracts/fixtures/sellers.json");
  const happy = readJson("contracts/fixtures/happy-path.json");

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(readFileSync(migrationPath, "utf8"));

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run("001_initial", new Date().toISOString());
    insertMarketplaceSources(db, marketplace);
    insertCatalog(db, sellerStore);
    insertCanonicalFlow(db, happy);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getCount(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function verifyDatabase(db) {
  db.exec("PRAGMA foreign_keys = ON");
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  assert.equal(integrity, "ok", "SQLite integrity_check must pass");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [], "foreign keys must be valid");

  const expectedCounts = {
    schema_migrations: db.prepare("SELECT name FROM sqlite_schema WHERE name='discovery_catalogs'").get() ? 2 : 1,
    users: 1,
    marketplace_sources: 11,
    sellers: 3,
    terms: 1,
    products: 7,
    product_sources: 15,
    seller_inventory: 7,
    campaigns: 1,
    requests: 1,
    request_sellers: 3,
    negotiation_rounds: 6,
    offers: 4,
    evaluations: 1,
    feedback_events: 0,
    user_preferences: 0,
    decisions: 0,
    redemptions: 0,
    idempotency_keys: 0,
  };
  for (const [table, expected] of Object.entries(expectedCounts)) {
    assert.equal(getCount(db, table), expected, `${table} row count mismatch`);
  }

  const offerRows = db.prepare(`
    SELECT offer_id, seller_id, total_price_twd, items_json
    FROM offers
    WHERE eligibility_status = 'eligible'
  `).all();
  for (const offer of offerRows) {
    const primary = JSON.parse(offer.items_json).find((item) => item.role === "primary");
    const inventory = db.prepare(`
      SELECT floor_price_twd, stock
      FROM seller_inventory
      WHERE seller_id = ? AND product_id = ?
    `).get(offer.seller_id, primary.product_id);
    assert.ok(inventory, `${offer.offer_id} primary product must resolve to Seller inventory`);
    assert.ok(offer.total_price_twd >= inventory.floor_price_twd, `${offer.offer_id} cannot cross the Seller floor`);
    assert.ok(inventory.stock > 0, `${offer.offer_id} needs positive seeded inventory`);
  }

  const evaluation = db.prepare("SELECT ranked_offers_json FROM evaluations WHERE evaluation_id = ?")
    .get("evaluation_demo_001");
  const rankedIds = JSON.parse(evaluation.ranked_offers_json).map((entry) => entry.offer_id).sort();
  const eligibleIds = offerRows.map((offer) => offer.offer_id).sort();
  assert.deepEqual(rankedIds, eligibleIds, "evaluation must rank every eligible offer exactly once");

  const originalPrice = db.prepare("SELECT total_price_twd FROM offers WHERE offer_id = ?").get("offer_a_r2").total_price_twd;
  assert.throws(
    () => db.prepare("UPDATE offers SET total_price_twd = total_price_twd + 1 WHERE offer_id = ?").run("offer_a_r2"),
    /offers are immutable/,
    "offer immutability trigger must block updates",
  );
  assert.equal(
    db.prepare("SELECT total_price_twd FROM offers WHERE offer_id = ?").get("offer_a_r2").total_price_twd,
    originalPrice,
    "blocked offer update must not change data",
  );

  const tableCount = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get().count);
  assert.equal(tableCount, expectedCounts.schema_migrations === 2 ? 21 : 19, "unexpected database table count");

  return { integrity, tableCount, counts: expectedCounts };
}

function printReport(report, label) {
  console.log(`✓ ${label}`);
  console.log(`✓ integrity_check: ${report.integrity}`);
  console.log(`✓ foreign_key_check: clean`);
  console.log(`✓ tables: ${report.tableCount}`);
  console.log(`✓ seeded: ${report.counts.marketplace_sources} sources, ${report.counts.sellers} Sellers, ${report.counts.products} products`);
  console.log(`✓ canonical flow: ${report.counts.requests} request, ${report.counts.negotiation_rounds} rounds, ${report.counts.offers} offers, ${report.counts.evaluations} evaluation`);
  console.log("✓ immutable Offer trigger: active");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const isMemory = args.has("--memory");
  const isCheck = args.has("--check");
  const force = args.has("--force");

  if (isMemory) {
    const db = new DatabaseSync(":memory:");
    try {
      initializeDatabase(db);
      printReport(verifyDatabase(db), "in-memory database initialized and verified");
    } finally {
      db.close();
    }
    return;
  }

  if (isCheck) {
    assert.ok(existsSync(databasePath), `database not found: ${databasePath}; run npm run db:init`);
    const db = new DatabaseSync(databasePath);
    try {
      printReport(verifyDatabase(db), `database verified: ${databasePath}`);
    } finally {
      db.close();
    }
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });
  if (existsSync(databasePath)) {
    assert.ok(force, `database already exists: ${databasePath}; use npm run db:rebuild to replace it`);
    const resolved = path.resolve(databasePath);
    assert.equal(path.dirname(resolved), path.resolve(dataDirectory), "refusing to remove a database outside data/");
    assert.equal(path.basename(resolved), "offermesh.sqlite", "refusing to remove an unexpected database file");
    rmSync(resolved);
  }

  const db = new DatabaseSync(databasePath);
  try {
    initializeDatabase(db);
    printReport(verifyDatabase(db), `database created: ${databasePath}`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
