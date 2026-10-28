import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { computeDecay, applyPriceMultiplier } from "@/lib/decay";
import { getMultipliers } from "@/lib/decay/constants";
import { QC_GRADES, QC_STATUSES } from "@/lib/constants";

/**
 * Admin & QC operations service.
 *
 * This is the write path behind the `/app/admin` panel. It covers the three
 * operational loops the story names:
 *
 * 1. **Receiving & QC** — an aggregator's batch moves through
 *    `in_transit` → `listed` (received at hub) → QC inspected → `passed` /
 *    `failed`. Every inspection is written to `BatchQcLog` with the visual
 *    grade, verified weight, temperature, notes and photos.
 * 2. **Freshness & pricing** — after an inspection the batch's tier and
 *    price multiplier are recomputed from its harvest date and the QC
 *    timestamp, using the *same* rule-based decay engine the customer
 *    catalogue prices with. There is no second pricing path: if the admin
 *    panel and the storefront disagreed about a price, a customer would be
 *    charged something other than what they saw.
 * 3. **Order & refund operations** — order fulfilment status transitions
 *    and refund/replacement decisions.
 *
 * All money is integer BDT and all quantities are floats (kg is fractional),
 * matching the schema's conventions.
 */

/**
 * @typedef {object} QcInspectionInput
 * @property {string} batchId
 * @property {string} grade          visual grade — 'A' | 'B' | 'C'
 * @property {number} weightKg       verified weight at the hub
 * @property {number} [temperatureC] storage temperature, if logged
 * @property {string} [notes]        free-text inspector notes
 * @property {string[]} [photos]     photo URLs
 * @property {boolean} [passed]      whether the batch passed inspection
 */

/**
 * @typedef {object} FreshnessAdjustment
 * @property {string} tier              the recomputed freshness tier
 * @property {number} multiplier        the price multiplier applied
 * @property {number} unitPrice         the resulting unit price in BDT
 * @property {number} daysSinceHarvest  days elapsed since harvest
 * @property {number} remainingShelfDays
 * @property {"list" | "list_with_warning" | "delist"} action
 * @property {string} status            the resulting batch status
 */

/**
 * The visual grade to tier mapping.
 *
 * A `C` grade — visibly damaged or spoiled — is a failed inspection
 * regardless of weight or temperature. Grades `A` and `B` pass, but a `B`
 * batch is capped at the `fair` tier, because a batch that needed a second
 * look cannot honestly be sold as "just harvested".
 *
 * @type {Record<string, "fresh" | "good" | "fair" | "expired">}
 */
const GRADE_TIER_CAP = {
  A: "fresh",
  B: "fair",
  C: "expired",
};

/**
 * Map a visual grade onto a freshness tier.
 *
 * @param {string} grade
 * @returns {"fresh" | "good" | "fair" | "expired"}
 */
export function tierForGrade(grade) {
  return GRADE_TIER_CAP[grade] ?? "fair";
}

/**
 * Recompute a batch's freshness tier and price from its harvest date and a
 * reference timestamp.
 *
 * The reference timestamp is the QC inspection time when a batch has been
 * inspected, and "now" otherwise — the story ties the tier to *harvest date
 * + QC timestamp*, and the decay engine already defines the day boundaries.
 *
 * A grade `B` caps the tier at `fair`; a grade `C` forces `expired`.
 *
 * @param {object} params
 * @param {Date} params.harvestDate
 * @param {number} params.harvestToShelfDays
 * @param {number} params.baseUnitPrice
 * @param {Date} [params.referenceDate]
 * @param {string} [params.grade]
 * @returns {FreshnessAdjustment}
 */
export function computeFreshnessAdjustment({
  harvestDate,
  harvestToShelfDays,
  baseUnitPrice,
  referenceDate = new Date(),
  grade,
}) {
  const decay = computeDecay(harvestDate, referenceDate, harvestToShelfDays);

  let tier = decay.tier;
  let multiplier = decay.multiplier;

  // A grade cap can only lower the tier, never raise it.
  if (grade) {
    const cap = tierForGrade(grade);
    if (cap === "expired") {
      tier = "expired";
      multiplier = 0;
    } else if (isWorseTier(cap, tier)) {
      tier = cap;
      multiplier = multiplierForTier(cap);
    }
  }

  const action = tier === "expired" ? "delist" : decay.action;

  return {
    tier,
    multiplier,
    unitPrice: applyPriceMultiplier(baseUnitPrice, multiplier),
    daysSinceHarvest: decay.daysSinceHarvest,
    remainingShelfDays: decay.remainingShelfDays,
    action,
    status: tier === "expired" ? "delisted" : "listed",
  };
}

/**
 * The tier order, freshest first.
 *
 * @type {Record<string, number>}
 */
const TIER_RANK = {
  fresh: 0,
  good: 1,
  fair: 2,
  near_expiry: 3,
  expired: 4,
};

/**
 * Is `candidate` a worse (older) tier than `tier`?
 *
 * @param {string} candidate
 * @param {string} tier
 * @returns {boolean}
 */
function isWorseTier(candidate, tier) {
  return (TIER_RANK[candidate] ?? 99) > (TIER_RANK[tier] ?? 0);
}

/**
 * The price multiplier for a tier, read from the decay engine so the admin
 * panel and the storefront can never drift apart.
 *
 * @param {string} tier
 * @returns {number}
 */
function multiplierForTier(tier) {
  return getMultipliers()[tier] ?? 0;
}

/**
 * Log a QC inspection and apply the resulting batch state.
 *
 * The inspection log and the batch update are written in a single
 * transaction, so a batch can never end up marked `passed` with no log
 * recording why, or vice versa.
 *
 * @param {string} inspectorId  the admin operator recording the inspection
 * @param {QcInspectionInput} input
 * @returns {Promise<{ batch: any, log: any, adjustment: FreshnessAdjustment }>}
 */
export async function logQcInspection(inspectorId, input) {
  const { batchId, grade, weightKg, temperatureC, notes, photos, passed } = input;

  if (!batchId) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "A batch must be selected.");
  }

  if (!QC_GRADES.includes(grade)) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "Choose a visual grade.", {
      issues: [{ path: "grade", message: "Grade must be A, B or C." }],
    });
  }

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "The verified weight must be greater than zero.", {
      issues: [{ path: "weightKg", message: "Enter the verified weight in kg." }],
    });
  }

  if (temperatureC !== undefined && temperatureC !== null && !Number.isFinite(temperatureC)) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "The temperature must be a number.");
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true },
  });

  if (!batch) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That batch could not be found.");
  }

  // A grade C is a failed inspection, whatever the operator toggled. The
  // grade is the evidence; the toggle cannot contradict it.
  const didPass = grade === "C" ? false : (passed ?? true);

  const inspectedAt = new Date();

  const adjustment = computeFreshnessAdjustment({
    harvestDate: batch.harvestDate,
    harvestToShelfDays: batch.product.harvestToShelfDays,
    baseUnitPrice: batch.product.baseUnitPrice,
    referenceDate: inspectedAt,
    grade,
  });

  const qcStatus = didPass ? "passed" : "failed";
  const nextStatus = didPass ? adjustment.status : "delisted";

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.batchQcLog.create({
      data: {
        batchId: batch.id,
        inspectorId,
        inspectedAt,
        grade,
        weightKg,
        temperatureC: temperatureC ?? null,
        passed: didPass,
        notes: notes?.trim() ? notes.trim() : null,
        photos: photos && photos.length > 0 ? JSON.stringify(photos) : null,
      },
    });

    // The verified weight becomes the batch's on-hand quantity. The
    // aggregator's declared inbound weight is what was *claimed*; the hub's
    // scale is what is actually available to sell.
    const availableQty = didPass ? weightKg : 0;

    const updated = await tx.batch.update({
      where: { id: batch.id },
      data: {
        qcStatus,
        status: nextStatus,
        inboundQty: weightKg,
        availableQty,
        currentTier: adjustment.tier,
        currentPriceMultiplier: adjustment.multiplier,
        inboundAt: batch.inboundAt ?? inspectedAt,
        listedAt: didPass ? (batch.listedAt ?? inspectedAt) : batch.listedAt,
        expiresAt:
          batch.expiresAt ??
          new Date(
            batch.harvestDate.getTime() + batch.product.harvestToShelfDays * 86_400_000,
          ),
      },
    });

    return { log, updated };
  });

  return { batch: result.updated, log: result.log, adjustment };
}

/**
 * List batches for the QC queue, newest arrivals first.
 *
 * @param {object} [options]
 * @param {string} [options.status]  filter by batch status
 * @param {string} [options.qcStatus] filter by QC status
 * @param {string} [options.search]  free-text match on batch code or product name
 * @param {number} [options.limit]
 * @returns {Promise<any[]>}
 */
export async function listBatchesForQc({
  status,
  qcStatus,
  search,
  limit = 100,
} = {}) {
  const where = {};

  if (status) where.status = status;
  if (qcStatus) where.qcStatus = qcStatus;

  if (search) {
    const term = search.trim();
    if (term) {
      where.OR = [
        { batchCode: { contains: term } },
        { product: { name: { contains: term } } },
        { originDistrict: { contains: term } },
      ];
    }
  }

  return prisma.batch.findMany({
    where,
    include: {
      product: true,
      aggregator: { select: { id: true, name: true, email: true, companyName: true } },
      qcLogs: { orderBy: { inspectedAt: "desc" }, take: 1 },
    },
    orderBy: [{ inboundAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(1, limit), 200),
  });
}

/**
 * Recalculate and persist the freshness tier for a single batch.
 *
 * This is the manual "re-run the pricing engine" action in the admin panel
 * — useful after a harvest date is corrected.
 *
 * @param {string} batchId
 * @param {Date} [now]
 * @returns {Promise<{ batch: any, adjustment: FreshnessAdjustment }>}
 */
export async function recalculateBatchFreshness(batchId, now = new Date()) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true },
  });

  if (!batch) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That batch could not be found.");
  }

  const lastLog = await prisma.batchQcLog.findFirst({
    where: { batchId },
    orderBy: { inspectedAt: "desc" },
    select: { grade: true, inspectedAt: true },
  });

  const adjustment = computeFreshnessAdjustment({
    harvestDate: batch.harvestDate,
    harvestToShelfDays: batch.product.harvestToShelfDays,
    baseUnitPrice: batch.product.baseUnitPrice,
    referenceDate: lastLog?.inspectedAt ?? now,
    grade: lastLog?.grade,
  });

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: {
      currentTier: adjustment.tier,
      currentPriceMultiplier: adjustment.multiplier,
      status: batch.status === "delisted" ? "delisted" : adjustment.status,
    },
  });

  return { batch: updated, adjustment };
}

/**
 * Recalculate the freshness tier for every listed batch.
 *
 * Called on the dashboard so the "expiring soon" figures are never stale.
 *
 * @param {Date} [now]
 * @returns {Promise<{ updated: number }>}
 */
export async function recalculateAllBatches(now = new Date()) {
  const batches = await prisma.batch.findMany({
    where: { status: { in: ["listed", "in_transit"] } },
    include: { product: true },
  });

  let updated = 0;

  for (const batch of batches) {
    const lastLog = await prisma.batchQcLog.findFirst({
      where: { batchId: batch.id },
      orderBy: { inspectedAt: "desc" },
      select: { grade: true, inspectedAt: true },
    });

    const adjustment = computeFreshnessAdjustment({
      harvestDate: batch.harvestDate,
      harvestToShelfDays: batch.product.harvestToShelfDays,
      baseUnitPrice: batch.product.baseUnitPrice,
      referenceDate: lastLog?.inspectedAt ?? now,
      grade: lastLog?.grade,
    });

    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        currentTier: adjustment.tier,
        currentPriceMultiplier: adjustment.multiplier,
        status: adjustment.tier === "expired" ? "delisted" : batch.status,
      },
    });

    updated += 1;
  }

  return { updated };
}
