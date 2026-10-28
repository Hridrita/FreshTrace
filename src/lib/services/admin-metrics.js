import { prisma } from "@/lib/prisma";

/**
 * Admin dashboard metrics.
 *
 * These are the numbers the FreshTrace team steers the business on, and they
 * are the five success criteria from the PRD (§"Success criteria"): QC pass
 * rate, spoilage rate, refund rate, gross margin per basket, and active
 * subscriptions.
 *
 * Every metric is computed from the operational record rather than being
 * stored, so the dashboard cannot drift from the underlying data. The
 * queries are aggregate-only — no rows are pulled into the app just to count
 * them.
 *
 * The reporting window is a rolling 30 days by default, because a rate
 * computed over the whole life of the business is dominated by the pilot
 * period and stops being useful for daily decisions.
 */

/** The default reporting window, in days. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * The start of the reporting window.
 *
 * @param {Date} now
 * @param {number} days
 * @returns {Date}
 */
function windowStart(now, days) {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * @typedef {object} AdminMetrics
 * @property {number} activeBaskets        live subscriptions delivering baskets
 * @property {number} totalSubscriptions    all subscriptions ever created
 * @property {number} activeSubscriptions   currently `active` subscriptions
 * @property {number} qcPassRate            % of inspections that passed
 * @property {number} refundRate            % of orders refunded or replaced
 * @property {number} spoilageRate          % of inspected weight written off
 * @property {number} grossMarginPercent    % gross margin per basket
 * @property {number} grossMarginPerBasket  BDT gross margin per basket
 * @property {number} avgBasketValue        BDT average basket value
 * @property {number} ordersInWindow        orders placed in the window
 * @property {number} revenueInWindow       BDT revenue in the window
 * @property {number} pendingQcBatches      batches awaiting inspection
 * @property {number} pendingRefunds        refunds awaiting a decision
 * @property {number} expiringSoonBatches   batches delisting within 2 days
 * @property {number} windowDays            the reporting window used
 */

/**
 * Compute every dashboard metric in one pass.
 *
 * @param {object} [options]
 * @param {Date} [options.now]
 * @param {number} [options.windowDays]
 * @returns {Promise<AdminMetrics>}
 */
export async function getAdminMetrics({ now = new Date(), windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const since = windowStart(now, windowDays);

  const [
    totalSubscriptions,
    activeSubscriptions,
    qcTotals,
    orderTotals,
    refundTotals,
    pendingQcBatches,
    pendingRefunds,
    expiringSoonBatches,
    costOfGoods,
  ] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: "active" } }),

    // ── QC pass rate ──────────────────────────────────────────────
    prisma.batchQcLog.groupBy({
      by: ["passed"],
      _count: { _all: true },
      where: { inspectedAt: { gte: since } },
    }),

    // ── Order value & fulfilment ──────────────────────────────────
    prisma.order.findMany({
      where: { placedAt: { gte: since }, status: { not: "cancelled" } },
      select: {
        grandTotal: true,
        deliveryFee: true,
        items: {
          select: {
            qty: true,
            lineTotal: true,
            batch: {
              select: {
                inboundQty: true,
                product: { select: { baseUnitPrice: true } },
              },
            },
          },
        },
      },
    }),

    // ── Refunds & replacements ────────────────────────────────────
    prisma.refund.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
      where: { createdAt: { gte: since } },
    }),

    prisma.batch.count({ where: { qcStatus: "pending", status: "in_transit" } }),

    prisma.refund.count({ where: { status: "requested" } }),

    prisma.batch.count({
      where: {
        status: "listed",
        expiresAt: { gte: now, lte: new Date(now.getTime() + 2 * 86_400_000) },
      },
    }),

    // ── Cost of goods, for the margin calculation ─────────────────
    prisma.orderItem.findMany({
      where: { order: { placedAt: { gte: since }, status: { not: "cancelled" } } },
      select: {
        qty: true,
        lineTotal: true,
        batch: {
          select: {
            inboundQty: true,
            product: { select: { baseUnitPrice: true } },
          },
        },
      },
    }),
  ]);

  // ── QC pass rate ────────────────────────────────────────────────
  const qcInspected = qcTotals.reduce((sum, row) => sum + row._count._all, 0);
  const qcPassed = qcTotals
    .filter((row) => row.passed)
    .reduce((sum, row) => sum + row._count._all, 0);
  const qcPassRate = qcInspected > 0 ? (qcPassed / qcInspected) * 100 : 0;

  // ── Refund rate ─────────────────────────────────────────────────
  // A refund or a replacement is a failed basket from the customer's point
  // of view, so both are counted. Rejected requests are not — the customer
  // kept a good basket.
  const refundedCount = refundTotals
    .filter((row) => row.status === "approved" || row.status === "processed")
    .reduce((sum, row) => sum + row._count._all, 0);
  const ordersInWindow = orderTotals.length;
  const refundRate = ordersInWindow > 0 ? (refundedCount / ordersInWindow) * 100 : 0;

  // ── Spoilage rate ───────────────────────────────────────────────
  // Spoilage is the weight an inspection *wrote off*: the difference between
  // what the aggregator declared inbound and what the hub verified. A failed
  // inspection writes off the whole declared weight.
  const { spoiledWeight, totalWeight } = await computeSpoilage(since);
  const spoilageRate = totalWeight > 0 ? (spoiledWeight / totalWeight) * 100 : 0;

  // ── Revenue & margin ────────────────────────────────────────────
  const revenueInWindow = orderTotals.reduce((sum, order) => sum + order.grandTotal, 0);
  const deliveryFees = orderTotals.reduce((sum, order) => sum + order.deliveryFee, 0);

  // The cost of goods is the *base* (pre-discount) value of what was sold.
  // A freshness discount is a margin reduction, not a cost — so the cost is
  // the undiscounted price of the quantity sold.
  const cogs = costOfGoods.reduce(
    (sum, item) => sum + item.qty * item.batch.product.baseUnitPrice,
    0,
  );

  const grossProfit = revenueInWindow - deliveryFees - cogs;
  const grossMarginPercent =
    revenueInWindow > 0 ? (grossProfit / revenueInWindow) * 100 : 0;

  const avgBasketValue = ordersInWindow > 0 ? revenueInWindow / ordersInWindow : 0;
  const grossMarginPerBasket = ordersInWindow > 0 ? grossProfit / ordersInWindow : 0;

  return {
    activeBaskets: activeSubscriptions,
    totalSubscriptions,
    activeSubscriptions,
    qcPassRate,
    refundRate,
    spoilageRate,
    grossMarginPercent,
    grossMarginPerBasket,
    avgBasketValue,
    ordersInWindow,
    revenueInWindow,
    pendingQcBatches,
    pendingRefunds,
    expiringSoonBatches,
    windowDays,
  };
}

/**
 * Compute the spoilage rate from the QC logs.
 *
 * A batch's "spoiled" weight is the weight the hub found missing: the
 * aggregator's declared inbound weight minus the verified weight, floored at
 * zero. A failed inspection is written off entirely.
 *
 * @param {Date} since
 * @returns {Promise<{ spoiledWeight: number, totalWeight: number }>}
 */
async function computeSpoilage(since) {
  const logs = await prisma.batchQcLog.findMany({
    where: { inspectedAt: { gte: since } },
    select: {
      passed: true,
      weightKg: true,
      batch: { select: { inboundQty: true } },
    },
  });

  let spoiledWeight = 0;
  let totalWeight = 0;

  for (const log of logs) {
    const declared = log.batch.inboundQty ?? 0;
    const verified = log.weightKg ?? 0;

    // The total is the declared weight, because that is the weight that
    // arrived and had to be accounted for.
    totalWeight += declared > 0 ? declared : verified;

    if (!log.passed) {
      // A failed inspection is written off in full.
      spoiledWeight += declared > 0 ? declared : verified;
    } else {
      // A passed inspection still loses the weight that was missing.
      const loss = declared - verified;
      if (loss > 0) spoiledWeight += loss;
    }
  }

  return { spoiledWeight, totalWeight };
}

/**
 * The per-tier breakdown of currently listed stock, for the dashboard's
 * freshness distribution.
 *
 * @returns {Promise<Array<{ tier: string, label: string, batches: number, qty: number }>>}
 */
export async function getTierDistribution() {
  const batches = await prisma.batch.findMany({
    where: { status: "listed" },
    select: { currentTier: true, availableQty: true },
  });

  const buckets = new Map();

  for (const batch of batches) {
    const tier = batch.currentTier ?? "fresh";
    const bucket = buckets.get(tier) ?? { tier, batches: 0, qty: 0 };
    bucket.batches += 1;
    bucket.qty += batch.availableQty;
    buckets.set(tier, bucket);
  }

  return [...buckets.values()];
}

/**
 * The QC pass-rate trend, one point per day over the reporting window.
 *
 * Used by the dashboard's sparkline so the team can see whether the pass
 * rate is improving rather than just what it is today.
 *
 * @param {Date} now
 * @param {number} windowDays
 * @returns {Promise<Array<{ date: string, passRate: number, inspected: number }>>}
 */
export async function getQcPassRateTrend(now = new Date(), windowDays = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(now, windowDays);

  const logs = await prisma.batchQcLog.findMany({
    where: { inspectedAt: { gte: since } },
    select: { inspectedAt: true, passed: true },
  });

  /** @type {Map<string, { inspected: number, passed: number }>} */
  const byDay = new Map();

  for (const log of logs) {
    const key = log.inspectedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? { inspected: 0, passed: 0 };
    bucket.inspected += 1;
    if (log.passed) bucket.passed += 1;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .map(([date, bucket]) => ({
      date,
      inspected: bucket.inspected,
      passRate: bucket.inspected > 0 ? (bucket.passed / bucket.inspected) * 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
