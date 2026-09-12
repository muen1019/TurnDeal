import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(root, "data");
const databasePath = path.join(dataDirectory, "offermesh.sqlite");
const migrationsDirectory = path.join(root, "db", "migrations");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function json(value) {
  return JSON.stringify(value);
}

function applyMigrations(db) {
  for (const filename of readdirSync(migrationsDirectory).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const version = filename.slice(0, -4);
    const hasMigrations = db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'schema_migrations'").get();
    if (hasMigrations && db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version)) continue;
    // SQLite table rebuilds require this pragma outside the migration transaction.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(path.join(migrationsDirectory, filename), "utf8"));
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [], `${version} must preserve references`);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
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
      seller_id, name, enabled, strategy_type, round_discounts_json,
      final_round, bundle_mode, personal_band, personal_rating,
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
      json(seller.strategy.round_discounts_twd),
      seller.strategy.final_round,
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
      candidate_products_json, status, final_offer_ids_json, stop_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      seller.stop_reason,
    );
  }

  const insertRound = db.prepare(`
    INSERT INTO negotiation_rounds (
      request_id, seller_id, round, outcome, buyer_message,
      seller_message, drafts_json, started_at, completed_at, is_final
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        Number(round.result.is_final),
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
  applyMigrations(db);

  db.exec("BEGIN IMMEDIATE");
  try {
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

function insertRow(db, table, row) {
  // Table/column names come exclusively from this script and SQLite schema metadata.
  const keys = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...Object.values(row));
}

function verifyNegotiationConstraints(db) {
  db.exec("SAVEPOINT constraint_checks");
  try {
    const round = db.prepare("SELECT * FROM negotiation_rounds WHERE seller_id = 'seller_a' AND round = 1").get();
    const offer = db.prepare("SELECT * FROM offers WHERE offer_id = 'offer_a_r5'").get();
    for (const value of [0, 6, 1.5]) {
      assert.throws(() => insertRow(db, "negotiation_rounds", { ...round, round: value }), /CHECK|INTEGER/);
      assert.throws(() => insertRow(db, "offers", { ...offer, offer_id: "invalid_round", round: value }), /CHECK|INTEGER/);
    }
    assert.throws(() => insertRow(db, "negotiation_rounds", { ...round, is_final: 1, outcome: "timeout" }), /CHECK/);
    const seller = db.prepare("SELECT * FROM sellers WHERE seller_id = 'seller_a'").get();
    insertRow(db, "sellers", { ...seller, seller_id: "seller_f" });
    const branch = db.prepare("SELECT * FROM request_sellers WHERE seller_id = 'seller_a'").get();
    assert.throws(() => insertRow(db, "request_sellers", { ...branch, seller_id: "seller_f", listing_rank: 6 }), /at most five/);
    assert.throws(() => db.prepare("UPDATE request_sellers SET listing_rank = 6 WHERE seller_id = 'seller_a'").run(), /at most five/);
    for (const schedule of [[0, 1], [0, 1, 2, 3, 4, 5], [0, 1, -1, 3, 4], [0, 1, 0, 3, 4], [0, 1, 2, 3, 4.5]]) {
      assert.throws(() => db.prepare("UPDATE sellers SET round_discounts_json = ? WHERE seller_id = 'seller_a'").run(json(schedule)), /CHECK|discount schedule/);
    }
  } finally {
    db.exec("ROLLBACK TO constraint_checks");
    db.exec("RELEASE constraint_checks");
  }
}

function verifyLegacyMigration() {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(path.join(migrationsDirectory, "001_initial.sql"), "utf8"));
    const time = "2026-09-12T10:00:00+08:00";
    insertRow(db, "schema_migrations", { version: "001_initial", applied_at: time });
    insertRow(db, "users", { user_id: "legacy_user", display_name: "Legacy buyer", created_at: time, updated_at: time });
    insertRow(db, "sellers", { seller_id: "legacy_seller", name: "Legacy Seller", enabled: 1, strategy_type: "value_bundle", round_1_discount_twd: 30, round_2_discount_twd: 60, bundle_mode: "free_optional_mouse_pad", personal_band: "neutral", personal_rating: null, personal_count: 0, marketplace_rating: null, marketplace_count: 0 });
    insertRow(db, "terms", { terms_id: "legacy_terms", warranty_months: 12, return_days: 7, payment_obligation: "one_time" });
    insertRow(db, "requests", { request_id: "legacy_request", user_id: "legacy_user", parent_request_id: null, revision: 1, intent_md: "Mouse", preference_md: "", normalized_intent_json: "{}", status: "redeemed", published_snapshot_json: '{"legacy":true}', created_at: time, updated_at: time });
    insertRow(db, "request_sellers", { request_id: "legacy_request", seller_id: "legacy_seller", listing_rank: 1, match_reason: "Legacy match", candidate_products_json: "[]", status: "offered", final_offer_ids_json: '["legacy_standalone","legacy_bundle"]' });
    insertRow(db, "negotiation_rounds", { request_id: "legacy_request", seller_id: "legacy_seller", round: 2, outcome: "offered", buyer_message: "Legacy buyer", seller_message: "Legacy quote", drafts_json: "[]", started_at: time, completed_at: time });
    const offer = { offer_id: "legacy_standalone", request_id: "legacy_request", seller_id: "legacy_seller", round: 2, variant: "standalone", baseline_offer_id: null, items_json: "[]", primary_features_json: "[]", total_price_twd: 569, delivery_days: 3, terms_id: "legacy_terms", optional_addons: 0, expires_at: "2026-09-12T18:00:00+08:00", eligibility_status: "eligible", eligibility_reason_codes_json: "[]", created_at: time };
    insertRow(db, "offers", offer);
    insertRow(db, "offers", { ...offer, offer_id: "legacy_bundle", variant: "bundle", baseline_offer_id: "legacy_standalone", optional_addons: 1 });
    insertRow(db, "decisions", { decision_id: "legacy_decision", request_id: "legacy_request", offer_id: "legacy_bundle", action: "accept", created_at: time });
    insertRow(db, "redemptions", { redemption_id: "legacy_redemption", decision_id: "legacy_decision", request_id: "legacy_request", offer_id: "legacy_bundle", status: "succeeded", total_price_twd: 569, failure_code: null, redeemed_at: time, created_at: time });
    const preserved = ["requests", "offers", "decisions", "redemptions"].map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]);
    applyMigrations(db);
    applyMigrations(db); // Applying already-recorded migrations must be a no-op.
    for (const [table, rows] of preserved) assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), rows, `${table} must survive the v0.2 migration unchanged`);
    assert.deepEqual(JSON.parse(db.prepare("SELECT round_discounts_json FROM sellers").get().round_discounts_json), [30, 60, 60, 60, 60]);
    assert.equal(db.prepare("SELECT is_final FROM negotiation_rounds").get().is_final, 0);
    assert.equal(db.prepare("SELECT stop_reason FROM request_sellers").get().stop_reason, null);
    assert.equal(getCount(db, "schema_migrations"), 3);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(() => db.exec("UPDATE offers SET total_price_twd = 1"), /offers are immutable/);
    assert.throws(() => db.exec("UPDATE requests SET published_snapshot_json = '{}'"), /published request snapshots are immutable/);
    console.log("✓ v0.1 migration preserves quotes, bundle references, accepted/redemption records and immutable snapshots");
  } finally {
    db.close();
  }
}

function verifyDatabase(db) {
  db.exec("PRAGMA foreign_keys = ON");
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  assert.equal(integrity, "ok", "SQLite integrity_check must pass");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [], "foreign keys must be valid");

  const expectedCounts = {
    schema_migrations: 3,
    users: 1,
    marketplace_sources: 11,
    sellers: 5,
    terms: 1,
    products: 9,
    product_sources: 19,
    seller_inventory: 9,
    campaigns: 1,
    requests: 1,
    request_sellers: 5,
    negotiation_rounds: 19,
    offers: 6,
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

  const originalPrice = db.prepare("SELECT total_price_twd FROM offers WHERE offer_id = ?").get("offer_a_r5").total_price_twd;
  assert.throws(
    () => db.prepare("UPDATE offers SET total_price_twd = total_price_twd + 1 WHERE offer_id = ?").run("offer_a_r5"),
    /offers are immutable/,
    "offer immutability trigger must block updates",
  );
  assert.equal(
    db.prepare("SELECT total_price_twd FROM offers WHERE offer_id = ?").get("offer_a_r5").total_price_twd,
    originalPrice,
    "blocked offer update must not change data",
  );

  const tableCount = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get().count);
  assert.equal(tableCount, 21, "unexpected database table count");

  verifyNegotiationConstraints(db);

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
  console.log("✓ five-Seller/five-round limits and discount schedule constraints: active");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const isMemory = args.has("--memory");
  const isCheck = args.has("--check");
  const force = args.has("--force");

  if (isMemory) {
    verifyLegacyMigration();
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
