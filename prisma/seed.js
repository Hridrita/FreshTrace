/**
 * FreshTrace seed script.
 *
 * Seeds a dev/staging database so the storefront and the operations panel
 * both show real, dynamic data out of the box — no empty states, no
 * placeholder rows.
 *
 * What it creates:
 *
 * - **1 admin** — `admin@freshtrace.com`, the fixed operations operator
 *   credential (SRS §3.1). Password is hashed with bcrypt; the plaintext is
 *   the documented development password.
 * - **2 aggregators** and **2 QC staff** — the people who supply and
 *   inspect the produce.
 * - **5 customers**, each with a delivery address.
 * - **10 products** — fruit, vegetables and herbs, each with a shelf life
 *   chosen so the seeded batches land in a spread of freshness tiers.
 * - **3 subscription plans** and **5 live subscriptions**, so the
 *   Subscriptions page and the "Active baskets" KPI are populated.
 * - **Batches** across every tier, status and QC outcome, each with the
 *   matching **QC inspection log**.
 * - **Orders, deliveries and payments**, so the Admin Dashboard's revenue,
 *   margin and refund figures are computed from a real trading history.
 *
 * The freshness tiers on each batch are **derived from the application's own
 * decay engine**, not hard-coded, so a batch's stored tier always agrees
 * with the tier the app computes for it at read time.
 *
 * No real PII: every value here is fabricated test data.
 *
 * Run with `npm run db:seed` (or `npx prisma db seed`).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/**
 * Run a write, retrying if the connection drops.
 *
 * The seed runs against a pooled Postgres connection, and a long seed can
 * outlive the pooler's idle window. When that happens Prisma reports
 * `P1017` ("Server has closed the connection") — a transient network
 * condition, not a data error — so the write is retried rather than
 * failing the whole seed.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {string} [label]
 * @returns {Promise<T>}
 */
async function withRetry(operation, label = "write") {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      const transient =
        err?.code === "P1017" ||
        /closed the connection|Connection reset|terminating connection|ETIMEDOUT|ECONNRESET/i.test(
          String(err?.message ?? ""),
        );

      if (!transient || attempt === MAX_ATTEMPTS) throw err;

      console.log(`   … connection dropped during ${label}, retrying (${attempt}/${MAX_ATTEMPTS})`);
      // Give the pooler a moment to hand out a fresh connection.
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("unreachable");
}

/**
 * Shared password for every seeded account. Development-only.
 *
 * Overridable through `SEED_PASSWORD` so a deployment can use its own.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD || "FreshTrace!2026";

/**
 * The operations panel's fixed operator.
 *
 * This is the credential the admin panel authenticates against
 * (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `@/lib/admin/auth`). Seeding it
 * with a *real* password hash — rather than the deliberately unusable one
 * `ensureAdminOperator()` writes — means the account works in the
 * storefront too, so it can sign in through the unified `/login` page.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@freshtrace.com";
const ADMIN_NAME = "FreshTrace Operations";

/**
 * The password the operations panel itself authenticates against.
 *
 * The dashboard is gated on a *fixed* credential (`ADMIN_PASSWORD` in
 * `@/lib/admin/auth`), checked before the customer directory is consulted —
 * so an admin who signs in with the seeded password would land on the
 * catalogue, not the panel.
 *
 * The seed therefore aligns the two: the admin's password **is** the
 * operations password. That keeps a single, memorable credential for the
 * seeded operator, and it is the one the seed prints at the end.
 *
 * `ADMIN_PASSWORD` still wins when it is set, so a deployment that has
 * already rotated the operations credential keeps it.
 */
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || process.env.SEED_PASSWORD || "FreshTrace!2026";

/**
 * Products with a shelf life chosen so the seeded batches land in a spread
 * of tiers once the decay engine runs.
 */
const PRODUCTS = [
  {
    sku: "FR-MNG-ALPHONSO",
    name: "Alphonso Mango",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 220,
    costUnitPrice: 125,
    description: "Premium Alphonso mangoes harvested from Rajshahi orchards.",
    originDistrict: "Rajshahi",
    harvestToShelfDays: 7,
  },
  {
    sku: "FR-MNG-HIMKOPA",
    name: "Himkopa Mango",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 120,
    costUnitPrice: 68,
    description: "Fibre-rich Himkapa mango, the staple Bangladeshi variety.",
    originDistrict: "Rajshahi",
    harvestToShelfDays: 7,
  },
  {
    sku: "FR-ORG-JUMBO",
    name: "Jumbo Orange",
    category: "fruit",
    defaultUnit: "piece",
    baseUnitPrice: 85,
    costUnitPrice: 48,
    description: "Seedless Valencia oranges, individually hand-sorted.",
    originDistrict: "Sylhet",
    harvestToShelfDays: 10,
  },
  {
    sku: "FR-ORG-CALAMANSI",
    name: "Calamansi",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 70,
    costUnitPrice: 40,
    description: "Small citrus with a sharp, fragrant peel.",
    originDistrict: "Sylhet",
    harvestToShelfDays: 12,
  },
  {
    sku: "FR-VEG-EGG",
    name: "Brinjal (Begun)",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 45,
    costUnitPrice: 26,
    description: "Glossy purple brinjal, harvested same day.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 5,
  },
  {
    sku: "FR-VEG-TOMATO",
    name: "Tomato",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 55,
    costUnitPrice: 31,
    description: "Vine-ripened tomatoes with high juice content.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 6,
  },
  {
    sku: "FR-VEG-OKRA",
    name: "Okra (Bhindi)",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 90,
    costUnitPrice: 51,
    description: "Tender green okra pods, cut daily.",
    originDistrict: "Munshiganj",
    harvestToShelfDays: 4,
  },
  {
    sku: "FR-VEG-GOURD",
    name: "Bottle Gourd (Lau)",
    category: "vegetable",
    defaultUnit: "piece",
    baseUnitPrice: 40,
    costUnitPrice: 23,
    description: "Light-green bottle gourd, uniform size.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 8,
  },
  {
    sku: "FR-HER-CORIANDER",
    name: "Coriander (Dhania)",
    category: "other",
    defaultUnit: "bunch",
    baseUnitPrice: 25,
    costUnitPrice: 14,
    description: "Fragrant coriander bunches, roots left on for shelf life.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 4,
  },
  {
    sku: "FR-HER-MINT",
    name: "Mint (Pudina)",
    category: "other",
    defaultUnit: "bunch",
    baseUnitPrice: 20,
    costUnitPrice: 11,
    description: "Cooling mint bunches for chutney and tea.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 3,
  },
];

const AGGREGATORS = [
  {
    email: "aggregator.mogra@freshtrace.test",
    name: "Nadia Haque",
    companyName: "Mogra Valley Farms",
    phone: "+8801700000001",
    districts: ["Dhaka", "Munshiganj", "Rajshahi"],
  },
  {
    email: "aggregator.sylhet@freshtrace.test",
    name: "Rahim Chowdhury",
    companyName: "Sylhet Highland Growers",
    phone: "+8801700000002",
    districts: ["Sylhet", "Chattogram"],
  },
];

const QC_STAFF = [
  { email: "qc.rafiq@freshtrace.test", name: "Rafiq Islam", phone: "+8801800000001" },
  { email: "qc.sumaiya@freshtrace.test", name: "Sumaiya Akter", phone: "+8801800000002" },
];

const CUSTOMERS = [
  { email: "customer.tareq@freshtrace.test", name: "Tareq Mahmud", phone: "+8801900000001" },
  { email: "customer.nusrat@freshtrace.test", name: "Nusrat Jahan", phone: "+8801900000002" },
  { email: "customer.sakib@freshtrace.test", name: "Sakib Al Hasan", phone: "+8801900000003" },
  { email: "customer.mehjabin@freshtrace.test", name: "Mehjabin Rahman", phone: "+8801900000004" },
  { email: "customer.arif@freshtrace.test", name: "Arif Hossain", phone: "+8801900000005" },
];

/**
 * The subscription plans on offer.
 *
 * `composition` is a list of product SKUs with the default quantity of each
 * in the basket. The basket size decides how many SKUs a plan carries and
 * how much of each (SRS §4.7): small ~3 kg over 5–6 SKUs, medium ~4–5 kg
 * over 6–8 SKUs, large ~5–6 kg over 7–9 SKUs.
 *
 * `weeklyPrice` is the *fresh-tier* price — a ceiling, not a fixed charge.
 * A renewal is priced from the actual freshness tier of each item on the
 * delivery day, so the real bill may come out lower.
 */
const PLANS = [
  {
    name: "Couple Weekly",
    basketSize: "small",
    weeklyPrice: 650,
    description: "A small weekly basket of seasonal fruit and vegetables.",
    composition: [
      { sku: "FR-MNG-HIMKOPA", defaultQty: 1.5 },
      { sku: "FR-ORG-CALAMANSI", defaultQty: 0.5 },
      { sku: "FR-VEG-EGG", defaultQty: 0.5 },
      { sku: "FR-VEG-TOMATO", defaultQty: 0.5 },
      { sku: "FR-HER-CORIANDER", defaultQty: 1 },
    ],
  },
  {
    name: "Family Weekly",
    basketSize: "medium",
    weeklyPrice: 1200,
    description: "A medium basket covering everyday household cooking.",
    composition: [
      { sku: "FR-MNG-HIMKOPA", defaultQty: 2 },
      { sku: "FR-ORG-JUMBO", defaultQty: 3 },
      { sku: "FR-VEG-EGG", defaultQty: 1 },
      { sku: "FR-VEG-TOMATO", defaultQty: 1 },
      { sku: "FR-VEG-OKRA", defaultQty: 0.5 },
      { sku: "FR-VEG-GOURD", defaultQty: 1 },
      { sku: "FR-HER-CORIANDER", defaultQty: 1 },
    ],
  },
  {
    name: "Family Premium",
    basketSize: "large",
    weeklyPrice: 1850,
    description: "A large basket with premium fruit and a wider vegetable mix.",
    composition: [
      { sku: "FR-MNG-ALPHONSO", defaultQty: 1 },
      { sku: "FR-MNG-HIMKOPA", defaultQty: 2 },
      { sku: "FR-ORG-JUMBO", defaultQty: 4 },
      { sku: "FR-ORG-CALAMANSI", defaultQty: 0.5 },
      { sku: "FR-VEG-EGG", defaultQty: 1.5 },
      { sku: "FR-VEG-TOMATO", defaultQty: 1.5 },
      { sku: "FR-VEG-OKRA", defaultQty: 0.75 },
      { sku: "FR-VEG-GOURD", defaultQty: 2 },
      { sku: "FR-HER-CORIANDER", defaultQty: 1 },
      { sku: "FR-HER-MINT", defaultQty: 1 },
    ],
  },
];

/**
 * The freshness-decay constants, shared with the application.
 *
 * They live in `prisma/seed-constants.js` because this script runs under
 * plain Node and cannot import the app's ESM `@/lib/decay/constants`. The
 * values are pinned against the app's own constants by
 * `tests/decay-constants.test.js`, so the two cannot drift apart.
 */
const {
  MS_PER_DAY,
  DHAKA_OFFSET_MS,
  TIER_BOUNDARIES,
  getMultipliers,
  resolveTier,
} = require("./seed-constants");

/**
 * Build a Date for a given number of days ago, at midnight Dhaka time.
 *
 * @param {number} daysAgo
 * @returns {Date}
 */
function daysAgoAtDhakaMidnight(daysAgo) {
  const now = Date.now();
  const shifted = new Date(now + DHAKA_OFFSET_MS);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - DHAKA_OFFSET_MS - daysAgo * MS_PER_DAY);
}

/**
 * Short, URL-safe slug used in the printed QR code.
 *
 * @param {number} [length]
 * @returns {string}
 */
function randomSlug(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Human-readable batch code, e.g. `FT-MNG-2026-10-09-A1`.
 *
 * @param {string} sku
 * @param {Date} harvestDate
 * @param {number} sequence
 * @returns {string}
 */
function batchCode(sku, harvestDate, sequence) {
  const shortSku = sku.replace(/^FR-/, "").split("-")[0].slice(0, 3).toUpperCase();
  const y = harvestDate.getUTCFullYear();
  const m = String(harvestDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(harvestDate.getUTCDate()).padStart(2, "0");
  return `FT-${shortSku}-${y}-${m}-${d}-${sequence}`;
}

/**
 * Human-readable order code, e.g. `FT-ORD-2026-10-09-0001`.
 *
 * @param {Date} placedAt
 * @param {number} sequence
 * @returns {string}
 */
function orderCode(placedAt, sequence) {
  const y = placedAt.getUTCFullYear();
  const m = String(placedAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(placedAt.getUTCDate()).padStart(2, "0");
  return `FT-ORD-${y}-${m}-${d}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Seed a set of batches spread across the freshness tiers.
 *
 * `daysAgo` is relative to "today", so the demo always shows a spread of
 * fresh, good, fair, near-expiry and expired batches. The tier and the
 * multiplier are **not** written down here — they are computed from the
 * product's shelf life and the harvest date by the decay engine, so a
 * stored tier can never disagree with the app's own calculation.
 *
 * `qc` describes the inspection outcome:
 * - `grade` — A (good) | B (acceptable) | C (rejected)
 * - `lostFraction` — the share of the declared inbound weight written off
 *   at inspection, which feeds the dashboard's spoilage rate.
 */
const BATCH_PLAN = [
  // { productIndex, daysAgo, status, qcStatus, inboundQty, soldFraction, qc }
  {
    productIndex: 0, daysAgo: 0, status: "listed", qcStatus: "passed",
    inboundQty: 120, soldFraction: 0.15,
    qc: { grade: "A", lostFraction: 0.01, temperatureC: 21 },
  },
  {
    productIndex: 0, daysAgo: 3, status: "listed", qcStatus: "passed",
    inboundQty: 90, soldFraction: 0.3,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 22 },
  },
  {
    productIndex: 0, daysAgo: 5, status: "listed", qcStatus: "passed",
    inboundQty: 60, soldFraction: 0.45,
    qc: { grade: "B", lostFraction: 0.06, temperatureC: 23 },
  },
  {
    productIndex: 1, daysAgo: 7, status: "listed", qcStatus: "passed",
    inboundQty: 75, soldFraction: 0.2,
    qc: { grade: "B", lostFraction: 0.05, temperatureC: 22 },
  },
  {
    productIndex: 1, daysAgo: 9, status: "delisted", qcStatus: "passed",
    inboundQty: 45, soldFraction: 0.6,
    qc: { grade: "C", lostFraction: 0.18, temperatureC: 25 },
  },

  {
    productIndex: 2, daysAgo: 1, status: "listed", qcStatus: "passed",
    inboundQty: 200, soldFraction: 0.1,
    qc: { grade: "A", lostFraction: 0.005, temperatureC: 20 },
  },
  {
    productIndex: 2, daysAgo: 4, status: "listed", qcStatus: "passed",
    inboundQty: 150, soldFraction: 0.25,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 21 },
  },
  {
    productIndex: 2, daysAgo: 11, status: "delisted", qcStatus: "passed",
    inboundQty: 80, soldFraction: 0.5,
    qc: { grade: "C", lostFraction: 0.2, temperatureC: 26 },
  },

  {
    productIndex: 3, daysAgo: 2, status: "listed", qcStatus: "passed",
    inboundQty: 40, soldFraction: 0.2,
    qc: { grade: "A", lostFraction: 0.01, temperatureC: 20 },
  },
  {
    productIndex: 3, daysAgo: 12, status: "sold_out", qcStatus: "passed",
    inboundQty: 35, soldFraction: 1,
    qc: { grade: "B", lostFraction: 0.04, temperatureC: 23 },
  },

  {
    productIndex: 4, daysAgo: 0, status: "listed", qcStatus: "passed",
    inboundQty: 65, soldFraction: 0.35,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 22 },
  },
  {
    productIndex: 4, daysAgo: 2, status: "listed", qcStatus: "passed",
    inboundQty: 50, soldFraction: 0.4,
    qc: { grade: "A", lostFraction: 0.03, temperatureC: 23 },
  },
  {
    productIndex: 4, daysAgo: 4, status: "listed", qcStatus: "passed",
    inboundQty: 30, soldFraction: 0.55,
    qc: { grade: "B", lostFraction: 0.07, temperatureC: 24 },
  },

  {
    productIndex: 5, daysAgo: 1, status: "listed", qcStatus: "passed",
    inboundQty: 110, soldFraction: 0.2,
    qc: { grade: "A", lostFraction: 0.01, temperatureC: 21 },
  },
  {
    productIndex: 5, daysAgo: 3, status: "listed", qcStatus: "passed",
    inboundQty: 95, soldFraction: 0.35,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 22 },
  },
  {
    productIndex: 5, daysAgo: 6, status: "listed", qcStatus: "passed",
    inboundQty: 40, soldFraction: 0.5,
    qc: { grade: "B", lostFraction: 0.08, temperatureC: 24 },
  },

  {
    productIndex: 6, daysAgo: 0, status: "listed", qcStatus: "passed",
    inboundQty: 25, soldFraction: 0.4,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 22 },
  },
  // Awaiting inspection — the hub queue on the dashboard.
  {
    productIndex: 6, daysAgo: 5, status: "in_transit", qcStatus: "pending",
    inboundQty: 30,
  },
  // Rejected at intake — a failed inspection.
  {
    productIndex: 6, daysAgo: 6, status: "in_transit", qcStatus: "failed",
    inboundQty: 22,
    qc: { grade: "C", lostFraction: 1, temperatureC: 28 },
  },

  {
    productIndex: 7, daysAgo: 2, status: "listed", qcStatus: "passed",
    inboundQty: 150, soldFraction: 0.25,
    qc: { grade: "A", lostFraction: 0.01, temperatureC: 21 },
  },
  {
    productIndex: 7, daysAgo: 5, status: "listed", qcStatus: "passed",
    inboundQty: 120, soldFraction: 0.4,
    qc: { grade: "B", lostFraction: 0.05, temperatureC: 23 },
  },
  // Two more inbound batches so the "Awaiting QC inspection" queue is not
  // empty on a fresh database.
  {
    productIndex: 8, daysAgo: 1, status: "in_transit", qcStatus: "pending",
    inboundQty: 18,
  },
  {
    productIndex: 9, daysAgo: 1, status: "in_transit", qcStatus: "pending",
    inboundQty: 14,
  },
  {
    productIndex: 8, daysAgo: 4, status: "listed", qcStatus: "passed",
    inboundQty: 24, soldFraction: 0.3,
    qc: { grade: "A", lostFraction: 0.02, temperatureC: 22 },
  },
];

/**
 * The trading history seeded for the Admin Dashboard.
 *
 * The dashboard's revenue, margin and refund figures are *computed* from
 * the order record (see `src/lib/services/admin-metrics.js`), so they are
 * only meaningful if there are orders. Each entry becomes one order with
 * its lines, delivery and payment.
 */
const ORDER_PLAN = [
  { customerIndex: 0, daysAgo: 3, status: "delivered", lines: 3, deliveryFee: 60 },
  { customerIndex: 1, daysAgo: 5, status: "delivered", lines: 2, deliveryFee: 60 },
  { customerIndex: 2, daysAgo: 6, status: "delivered", lines: 4, deliveryFee: 80 },
  { customerIndex: 3, daysAgo: 8, status: "delivered", lines: 2, deliveryFee: 60 },
  { customerIndex: 4, daysAgo: 9, status: "delivered", lines: 3, deliveryFee: 60 },
  { customerIndex: 0, daysAgo: 12, status: "delivered", lines: 2, deliveryFee: 60 },
  { customerIndex: 1, daysAgo: 15, status: "delivered", lines: 3, deliveryFee: 60 },
  { customerIndex: 2, daysAgo: 18, status: "in_transit", lines: 2, deliveryFee: 60 },
  { customerIndex: 3, daysAgo: 21, status: "delivered", lines: 3, deliveryFee: 80 },
  { customerIndex: 4, daysAgo: 24, status: "delivered", lines: 2, deliveryFee: 60 },
];

/**
 * The refund cases the dashboard's "Refunds pending" tile and the refund
 * queue need.
 */
const REFUND_PLAN = [
  { orderPlanIndex: 0, reason: "Two items arrived bruised.", amountShare: 0.5, status: "requested" },
  { orderPlanIndex: 2, reason: "Quality did not match the fresh tier shown.", amountShare: 1, status: "requested" },
  { orderPlanIndex: 4, reason: "Missing an item from the basket.", amountShare: 0.35, status: "approved" },
  { orderPlanIndex: 6, reason: "Item spoiled within a day of delivery.", amountShare: 1, status: "processed" },
];

/**
 * Delete all rows in an order that respects foreign-key constraints.
 *
 * `adminSession` must go before `user`, and `session` likewise, because
 * both reference a `User` with a cascade delete — but the cascade only
 * fires for rows Prisma knows about, and an explicit delete is cheaper and
 * keeps the intent obvious.
 */
async function clearAll() {
  await prisma.refundItem.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.batchQcLog.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.session.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hubClosure.deleteMany();
}

async function main() {
  console.log("🌱 Seeding FreshTrace development data...\n");

  await clearAll();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  console.log(`   Password for all seeded accounts: "${SEED_PASSWORD}"\n`);

  // ── Admin ────────────────────────────────────────────────────────────────
  // The operations operator. This is the same address the admin panel
  // authenticates against, and the password hash is a *real* one so the
  // account also works through the unified `/login` page. The hash is of
  // the *operations* password, so the credential that opens the panel and
  // the credential that opens the storefront are the same one.
  const admin = await withRetry(() => prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      name: ADMIN_NAME,
      role: "admin",
      status: "active",
      lastLoginAt: new Date(),
    },
  }), "user");
  console.log(`   ✓ admin            ${admin.email}`);

  // ── Aggregators ──────────────────────────────────────────────────────────
  const aggregators = [];
  for (const agg of AGGREGATORS) {
    const created = await withRetry(() => prisma.user.create({
      data: {
        email: agg.email,
        passwordHash,
        name: agg.name,
        phone: agg.phone,
        role: "aggregator",
        status: "active",
        companyName: agg.companyName,
        districts: JSON.stringify(agg.districts),
        lastLoginAt: new Date(),
      },
    }), "user");
    aggregators.push(created);
    console.log(`   ✓ aggregator       ${created.email}`);
  }

  // ── QC staff ─────────────────────────────────────────────────────────────
  const qcStaff = [];
  for (const member of QC_STAFF) {
    const created = await withRetry(() => prisma.user.create({
      data: {
        email: member.email,
        passwordHash,
        name: member.name,
        phone: member.phone,
        role: "qc_staff",
        status: "active",
        lastLoginAt: new Date(),
      },
    }), "user");
    qcStaff.push(created);
    console.log(`   ✓ qc_staff         ${created.email}`);
  }

  // ── Customers ────────────────────────────────────────────────────────────
  const customers = [];
  for (const customer of CUSTOMERS) {
    const created = await withRetry(() => prisma.user.create({
      data: {
        email: customer.email,
        passwordHash,
        name: customer.name,
        phone: customer.phone,
        role: "customer",
        status: "active",
        lastLoginAt: new Date(),
      },
    }), "user");
    customers.push(created);
  }
  console.log(`   ✓ customers        ${customers.length} created`);

  // ── Products ─────────────────────────────────────────────────────────────
  const products = [];
  for (const product of PRODUCTS) {
    const created = await withRetry(() => prisma.product.create({
      data: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        defaultUnit: product.defaultUnit,
        baseUnitPrice: product.baseUnitPrice,
        costUnitPrice: product.costUnitPrice,
        description: product.description,
        originDistrict: product.originDistrict,
        harvestToShelfDays: product.harvestToShelfDays,
        isActive: true,
        imageUrl: null,
      },
    }), "product");
    products.push(created);
  }
  console.log(`   ✓ products         ${products.length} created`);

  // ── Subscription plans ───────────────────────────────────────────────────
  // The plan's composition is written in SKUs, because SKUs are stable and
  // human-readable in the seed file. The stored column holds product ids.
  const productIdBySku = new Map(products.map((p) => [p.sku, p.id]));

  const plans = [];
  for (const plan of PLANS) {
    const composition = plan.composition
      .filter((item) => productIdBySku.has(item.sku))
      .map((item) => ({
        productId: productIdBySku.get(item.sku),
        defaultQty: item.defaultQty,
      }));

    if (composition.length === 0) {
      throw new Error(
        `Subscription plan "${plan.name}" has no resolvable products in its composition.`,
      );
    }

    const created = await withRetry(() => prisma.subscriptionPlan.create({
      data: {
        name: plan.name,
        basketSize: plan.basketSize,
        weeklyPrice: plan.weeklyPrice,
        description: plan.description,
        composition: JSON.stringify(composition),
        isActive: true,
      },
    }), "plan");
    plans.push(created);
  }
  console.log(`   ✓ subscription plans ${plans.length} created`);

  // ── Batches ──────────────────────────────────────────────────────────────
  const multipliers = getMultipliers();
  const listedBatches = [];

  for (const [index, spec] of BATCH_PLAN.entries()) {
    const product = products[spec.productIndex];
    const aggregator = aggregators[index % aggregators.length];
    const harvestDate = daysAgoAtDhakaMidnight(spec.daysAgo);

    // A batch's shelf life runs from harvest; `expiresAt` is the expiry point.
    const expiresAt = new Date(
      harvestDate.getTime() + product.harvestToShelfDays * MS_PER_DAY,
    );

    // The tier and the multiplier come from the decay engine, so the stored
    // values always agree with what the app computes at read time.
    const daysSinceHarvest = spec.daysAgo;
    const tier = resolveTier(daysSinceHarvest, product.harvestToShelfDays);
    const multiplier = multipliers[tier];

    // A batch that failed inspection is not listed. An expired batch is
    // delisted. A pending one is still in transit.
    const status = spec.status;
    const listed = status === "listed" || status === "sold_out";

    const soldFraction = spec.soldFraction ?? 0;
    const availableQty = listed
      ? Math.max(0, spec.inboundQty * (1 - soldFraction))
      : status === "in_transit"
        ? spec.inboundQty
        : 0;

    const sequence = (index % 9) + 1;

    const batch = await withRetry(() => prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: batchCode(product.sku, harvestDate, sequence),
        qrSlug: randomSlug(),
        harvestDate,
        originDistrict: product.originDistrict || "Dhaka",
        inboundQty: spec.inboundQty,
        availableQty,
        qcStatus: spec.qcStatus,
        currentTier: spec.qcStatus === "pending" ? null : tier,
        currentPriceMultiplier: spec.qcStatus === "pending" ? 1.0 : multiplier,
        status,
        inboundAt: new Date(harvestDate.getTime() + 12 * 3_600_000),
        listedAt: listed
          ? new Date(harvestDate.getTime() + 18 * 3_600_000)
          : null,
        expiresAt,
      },
    }), "batch");

    if (listed) {
      listedBatches.push({
        batch,
        product,
        tier,
        multiplier,
        // How old the batch was on the day it was harvested — the order
        // lines need it to work out the tier a batch was in on the day it
        // was bought.
        daysAgo: spec.daysAgo,
      });
    }

    // ── QC inspection log ─────────────────────────────────────────────
    // Every inspected batch gets a log. A failed inspection writes the
    // whole declared weight off; a passed one writes off only the weight
    // that was missing. Both feed the dashboard's spoilage rate.
    if (spec.qc) {
      const weightKg = spec.qc.lostFraction >= 1
        ? spec.inboundQty
        : spec.inboundQty * (1 - spec.qc.lostFraction);

      await withRetry(() => prisma.batchQcLog.create({
        data: {
          batchId: batch.id,
          inspectorId: qcStaff[index % qcStaff.length].id,
          inspectedAt: new Date(harvestDate.getTime() + 14 * 3_600_000),
          grade: spec.qc.grade,
          weightKg: Math.round(weightKg * 100) / 100,
          temperatureC: spec.qc.temperatureC,
          passed: spec.qc.grade !== "C",
          notes: qcNote(spec.qc.grade),
          photos: JSON.stringify([]),
        },
      }), "QC log");

      // A second, re-inspection log for a couple of batches, so the QC
      // history has more than one row per batch and the pass-rate trend
      // spans more than one day.
      if (index % 4 === 0) {
        await withRetry(() => prisma.batchQcLog.create({
          data: {
            batchId: batch.id,
            inspectorId: qcStaff[(index + 1) % qcStaff.length].id,
            inspectedAt: new Date(harvestDate.getTime() + 20 * 3_600_000),
            grade: spec.qc.grade === "C" ? "B" : "A",
            weightKg: Math.round(weightKg * 0.98 * 100) / 100,
            temperatureC: spec.qc.temperatureC - 1,
            passed: true,
            notes: "Re-inspected after sorting; the balance passed inspection.",
            photos: JSON.stringify([]),
          },
        }), "QC log");
      }
    }
  }
  console.log(`   ✓ batches          ${BATCH_PLAN.length} created`);

  // ── Addresses for customers ─────────────────────────────────────────────
  const addresses = [];
  for (const [index, customer] of customers.entries()) {
    const created = await withRetry(() => prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: `House ${10 + index}, Road ${5 + index}`,
        line2: index % 2 === 0 ? "Flat 4B" : null,
        area: ["Gulshan-2", "Dhanmondi-27", "Banani-11", "Uttara Sector-4", "Mirpur-10"][index],
        city: "Dhaka",
        isDefault: true,
      },
    }), "address");
    addresses.push(created);
  }
  console.log(`   ✓ addresses        ${addresses.length} created`);

  // ── Subscriptions ────────────────────────────────────────────────────────
  // Five live plans, so the storefront's Subscriptions page and the
  // dashboard's "Active baskets" KPI both have something to show.
  const subscriptions = [];
  for (const [index, customer] of customers.entries()) {
    const plan = plans[index % plans.length];
    const created = await withRetry(() => prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: addresses[index].id,
        dayOfWeek: (index + 3) % 7,
        status: "active",
        nextDeliveryAt: new Date(Date.now() + (index + 1) * MS_PER_DAY),
        startedAt: daysAgoAtDhakaMidnight(30 - index * 3),
      },
    }), "subscription");
    subscriptions.push(created);
  }
  console.log(`   ✓ subscriptions    ${subscriptions.length} active`);

  // ── Orders, deliveries and payments ─────────────────────────────────────
  // The dashboard's revenue, margin and refund figures are computed from
  // these rows, so they are what make the KPIs non-zero.
  const seededOrders = [];

  for (const [index, spec] of ORDER_PLAN.entries()) {
    const customer = customers[spec.customerIndex];
    const address = addresses[spec.customerIndex];
    const placedAt = daysAgoAtDhakaMidnight(spec.daysAgo);
    const isDelivered = spec.status === "delivered";

    // The lines are drawn from the listed stock, so every order line points
    // at a real batch and the stock decrement is consistent.
    const lines = [];
    for (let line = 0; line < spec.lines; line += 1) {
      // A batch can only have been bought on a day *after* it was
      // harvested, and it must not have expired by then. Candidates are
      // therefore the batches whose age on the order date still leaves
      // them sellable.
      const candidates = listedBatches.filter((candidate) => {
        const age = spec.daysAgo - candidate.daysAgo;
        if (age < 0) return false;
        return (
          resolveTier(age, candidate.product.harvestToShelfDays) !== "expired"
        );
      });

      if (candidates.length === 0) continue;

      // Most lines are the freshest stock available on that day — which is
      // what a real customer buys. Every fourth line is deliberately drawn
      // from a batch that had begun to age, so the seeded history contains
      // the discounted sales the margin figure is meant to reflect without
      // letting the discount dominate the mix.
      //
      // A discounted line still earns a margin: the aggregator's wholesale
      // cost falls with the tier too, just not by as much as the retail
      // price (`COST_DECAY` in `services/admin-metrics.js`). A minority of
      // aged lines is realistic; a third of them would make the demo read
      // as a business that discounts most of what it sells.
      const wantStale = line % 4 === 3;
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          age: spec.daysAgo - candidate.daysAgo,
        }))
        .sort((a, b) =>
          wantStale ? b.age - a.age : a.age - b.age,
        );

      // A fresh line is drawn from the head of the ranking; a deliberately
      // stale line from its tail, so the two kinds are never the same batch.
      const pick = wantStale
        ? ranked[Math.max(0, ranked.length - 1 - (line % 2))].candidate
        : ranked[line % Math.min(ranked.length, 3)].candidate;
      if (!pick) continue;

      // A household basket holds a few kilograms, not a fraction of a
      // warehouse batch. The line quantity is a realistic per-item amount
      // for a weekly FreshTrace basket, so the order's value and the
      // dashboard's margin figures read like a real basket rather than a
      // wholesale shipment.
      const qty = pick.product.defaultUnit === "bunch"
        ? 2
        : Math.round((1 + (line % 3) * 0.5) * 10) / 10;

      // The line is priced at the tier the batch was **on the day the order
      // was placed**, not at its tier today. A real order prices the batch
      // as it was when it was bought (`priceBatch` in `services/orders.js`),
      // so pricing the history at today's tier would retroactively discount
      // every old sale and make the gross margin look wrong.
      //
      // The tier depends on how long the batch had been harvested *by the
      // order date*, which is the gap between the harvest and the order —
      // not the order's own age.
      const daysSinceHarvestAtOrder = Math.max(0, spec.daysAgo - pick.daysAgo);
      const tierAtOrder = resolveTier(
        daysSinceHarvestAtOrder,
        pick.product.harvestToShelfDays,
      );

      const multiplierAtOrder = multipliers[tierAtOrder];
      const unitPrice = Math.round(pick.product.baseUnitPrice * multiplierAtOrder);
      const lineTotal = Math.round(qty * unitPrice);

      lines.push({ pick, qty, unitPrice, lineTotal, tierAtOrder });
    }

    if (lines.length === 0) continue;

    // Every line must carry a real price — a zero subtotal would make the
    // refund arithmetic meaningless and the margin figures nonsense.
    if (lines.every((line) => line.lineTotal <= 0)) continue;

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const grandTotal = subtotal + spec.deliveryFee;

    const order = await withRetry(() => prisma.order.create({
      data: {
        orderCode: orderCode(placedAt, index + 1),
        customerId: customer.id,
        addressSnapshot: JSON.stringify({
          label: address.label,
          line1: address.line1,
          area: address.area,
          city: address.city,
        }),
        subtotal,
        deliveryFee: spec.deliveryFee,
        grandTotal,
        paymentStatus: isDelivered ? "paid" : "paid",
        paymentMethod: index % 3 === 0 ? "bkash" : index % 3 === 1 ? "nagad" : "card",
        status: spec.status,
        placedAt,
        paidAt: new Date(placedAt.getTime() + 15 * 60_000),
        deliveredAt: isDelivered
          ? new Date(placedAt.getTime() + 26 * 3_600_000)
          : null,
      },
    }), "order");

    for (const line of lines) {
      await withRetry(() => prisma.orderItem.create({
        data: {
          orderId: order.id,
          batchId: line.pick.batch.id,
          name: line.pick.product.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          freshnessTierAtOrder: line.tierAtOrder,
        },
      }), "order item");
    }

    await withRetry(() => prisma.delivery.create({
      data: {
        orderId: order.id,
        courier: index % 2 === 0 ? "pathao" : "steedex",
        courierOrderId: `FT${String(880000 + index)}`,
        courierTrackingId: `TRK${String(550000 + index)}`,
        courierStatus: isDelivered ? "delivered" : "in_transit",
        assignedAt: new Date(placedAt.getTime() + 3_600_000),
        pickedUpAt: new Date(placedAt.getTime() + 5 * 3_600_000),
        deliveredAt: isDelivered
          ? new Date(placedAt.getTime() + 26 * 3_600_000)
          : null,
        riderInfo: JSON.stringify({
          name: ["Sohel Rana", "Mizanur Rahman", "Arif Hossain"][index % 3],
          phone: `+88019${String(10000000 + index)}`,
        }),
      },
    }), "delivery");

    await withRetry(() => prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "mock_stripe",
        sessionId: `cs_test_seed_${index + 1}`,
        gatewayTxnId: `txn_seed_${index + 1}`,
        method: index % 3 === 0 ? "bkash" : index % 3 === 1 ? "nagad" : "card",
        amount: grandTotal,
        status: "success",
        receivedAt: new Date(placedAt.getTime() + 16 * 60_000),
      },
    }), "payment");

    seededOrders.push({ order, lines, placedAt, customer, address });
  }
  console.log(`   ✓ orders           ${seededOrders.length} created`);

  // ── Refunds ──────────────────────────────────────────────────────────────
  // A mix of open and decided refunds, so the "Refunds pending" tile and
  // the refund queue both have entries.
  let refundCount = 0;
  for (const spec of REFUND_PLAN) {
    const seeded = seededOrders[spec.orderPlanIndex];
    if (!seeded) continue;

    const amount = Math.max(1, Math.round(seeded.order.subtotal * spec.amountShare));
    const requestedBy = spec.status === "requested" ? seeded.customer.id : admin.id;
    const resolved = spec.status !== "requested";

    const refund = await withRetry(() => prisma.refund.create({
      data: {
        orderId: seeded.order.id,
        requestedBy,
        requestedByRole: spec.status === "requested" ? "customer" : "admin",
        reason: spec.reason,
        amount,
        status: spec.status,
        resolvedBy: resolved ? admin.id : null,
        resolvedAt: resolved ? new Date(seeded.placedAt.getTime() + 30 * 3_600_000) : null,
        gatewayRefundRef: resolved ? `re_seed_${refundCount + 1}` : null,
      },
    }), "refund");

    // The refund is broken down against the order lines, so the panel can
    // show which items were refunded.
    for (const line of seeded.lines) {
      const lineAmount = Math.min(
        line.lineTotal,
        Math.max(1, Math.round(amount * (line.lineTotal / seeded.order.subtotal))),
      );

      const orderItem = await prisma.orderItem.findFirst({
        where: { orderId: seeded.order.id, batchId: line.pick.batch.id },
      });
      if (!orderItem) continue;

      await withRetry(() => prisma.refundItem.create({
        data: {
          refund: { connect: { id: refund.id } },
          orderItem: { connect: { id: orderItem.id } },
          qty: line.qty,
          amount: lineAmount,
        },
      }), "refund item");
    }

    refundCount += 1;
  }
  console.log(`   ✓ refunds          ${refundCount} created`);

  console.log("\n✅ Seed complete.\n");
  console.log("   Sign in at /login with:");
  console.log(`     admin    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}   → /app/admin`);
  console.log(`     customer ${CUSTOMERS[0].email} / ${SEED_PASSWORD}\n`);
}

/**
 * The note recorded against a QC inspection, by grade.
 *
 * @param {string} grade
 * @returns {string}
 */
function qcNote(grade) {
  if (grade === "A") {
    return "Visual inspection passed; no bruising, pest damage or off-odour.";
  }
  if (grade === "B") {
    return "Minor surface marks. Trimmed and graded down; balance passed inspection.";
  }
  return "Significant bruising found at intake. Batch rejected and written off.";
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
