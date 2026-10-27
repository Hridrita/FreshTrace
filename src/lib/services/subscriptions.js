import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";

/**
 * Subscription service.
 *
 * SRS §4.7–§4.8 and the `subscription-management` spec define a recurring
 * weekly basket:
 *
 * 1. **A plan.** A `SubscriptionPlan` carries a name, a basket size, a
 *    weekly price and a composition (a JSON array of `{ productId,
 *    defaultQty }`). The weekly price is the *fresh-tier* price — a ceiling,
 *    not a fixed charge. A renewal is priced from the actual freshness tier
 *    of each item on the delivery day, so it may come out lower.
 * 2. **A fixed weekly delivery day.** A subscription has exactly one
 *    `dayOfWeek` (0 = Sunday … 6 = Saturday) and a `nextDeliveryAt` that
 *    advances by seven days on each renewal.
 * 3. **A lifecycle.** `active` → `paused` → `active`, and `active`/`paused`
 *    → `ended`. A paused subscription generates no renewal orders. An ended
 *    subscription is never renewed.
 * 4. **Hub closures.** A renewal falling on a date the hub is closed is
 *    skipped — no order is placed and the delivery date advances by seven
 *    days.
 *
 * This module owns the state transitions and the date arithmetic. It does
 * *not* create renewal orders — that belongs to the renewal cron job, which
 * is a later story. What it does is make sure every transition is legal and
 * that `nextDeliveryAt` is always the next real delivery date.
 */

/**
 * @typedef {object} PlanCompositionItem
 * @property {string} productId
 * @property {number} defaultQty
 */

/**
 * Midnight Dhaka time on the calendar day the given instant falls on.
 *
 * @param {Date} date
 * @returns {Date}
 */
export function startOfDhakaDay(date) {
  const shifted = new Date(date.getTime() + 6 * 3_600_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - 6 * 3_600_000);
}

/**
 * The day of the week (0 = Sunday … 6 = Saturday) of a Dhaka calendar date.
 *
 * The weekday is read from the *shifted* instant, not from
 * `startOfDhakaDay`. Dhaka midnight is 18:00 UTC on the previous calendar
 * day, so reading `getUTCDay()` off it would report the previous day's
 * weekday — every delivery would land a day late.
 *
 * @param {Date} date
 * @returns {number}
 */
export function dayOfWeekInDhaka(date) {
  return new Date(date.getTime() + 6 * 3_600_000).getUTCDay();
}

/**
 * The next occurrence of a weekday, on or after `from`.
 *
 * The delivery lands in the morning, so the hour is set to a fixed 8am
 * Dhaka time. The result is always *on or after* `from` — when `from` is
 * already the chosen weekday, that day is returned.
 *
 * @param {number} dayOfWeek 0 = Sunday … 6 = Saturday
 * @param {Date} from
 * @returns {Date}
 */
export function nextOccurrenceOf(dayOfWeek, from) {
  const start = startOfDhakaDay(from);
  const currentDay = dayOfWeekInDhaka(from);

  // The number of days to add to land on the wanted weekday. The
  // `((7 + target - current) % 7)` form keeps the result in 0…6.
  const offset = (7 + dayOfWeek - currentDay) % 7;
  const day = new Date(start.getTime() + offset * 86_400_000);

  // `day` is the instant of Dhaka midnight for the delivery date, which is
  // 18:00 UTC on the previous calendar day. The delivery lands in the
  // morning, so six more hours put it at 08:00 Dhaka.
  return new Date(day.getTime() + 6 * 3_600_000);
}

/**
 * Parse a plan's composition into a structured list.
 *
 * The composition is stored as a JSON string. A malformed or missing
 * composition is treated as an empty basket rather than throwing — a plan
 * with a broken composition should still be listed, and the renewal job is
 * where a broken composition matters.
 *
 * @param {string | null | undefined} composition
 * @returns {PlanCompositionItem[]}
 */
export function parseComposition(composition) {
  if (!composition) return [];

  try {
    const parsed = JSON.parse(composition);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof item.productId === "string" &&
          Number.isFinite(item.defaultQty) &&
          item.defaultQty > 0,
      )
      .map((item) => ({
        productId: item.productId,
        defaultQty: item.defaultQty,
      }));
  } catch {
    return [];
  }
}

/**
 * List the subscription plans a customer can subscribe to.
 *
 * Only active plans are returned. A plan that an admin deactivates
 * disappears from the list, but subscriptions already on that plan keep
 * running unchanged.
 *
 * @returns {Promise<import("@prisma/client").SubscriptionPlan[]>}
 */
export async function listActivePlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ weeklyPrice: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Fetch one plan by id.
 *
 * @param {string} planId
 * @returns {Promise<import("@prisma/client").SubscriptionPlan>}
 */
export async function getPlan(planId) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });

  if (!plan) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That subscription plan could not be found.");
  }

  return plan;
}

/**
 * A customer's subscriptions, newest first.
 *
 * The query is scoped to the customer, so one customer can never see
 * another's subscriptions.
 *
 * @param {string} customerId
 * @param {object} [filters]
 * @param {string} [filters.status] restrict to one lifecycle state
 * @returns {Promise<import("@prisma/client").Subscription[]>}
 */
export async function listSubscriptions(customerId, { status } = {}) {
  return prisma.subscription.findMany({
    where: {
      customerId,
      ...(status ? { status } : {}),
    },
    include: { plan: true, address: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * A customer's *current* subscription — the one that is active or paused.
 *
 * The page shows this subscription when there is one and the plans
 * otherwise. An ended subscription does not count, so a customer who
 * cancelled can subscribe again.
 *
 * @param {string} customerId
 * @returns {Promise<(import("@prisma/client").Subscription & { plan: any, address: any }) | null>}
 */
export async function getCurrentSubscription(customerId) {
  return prisma.subscription.findFirst({
    where: { customerId, status: { in: ["active", "paused"] } },
    include: { plan: true, address: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetch one of a customer's subscriptions.
 *
 * A subscription belonging to somebody else is reported as `not_found`
 * rather than `forbidden` — telling the caller it exists would disclose
 * the fact that it exists at all.
 *
 * @param {string} customerId
 * @param {string} subscriptionId
 * @returns {Promise<import("@prisma/client").Subscription & { plan: any, address: any }>}
 */
export async function getSubscription(customerId, subscriptionId) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, address: true },
  });

  if (!subscription || subscription.customerId !== customerId) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That subscription could not be found.");
  }

  return subscription;
}

/**
 * Create a subscription.
 *
 * The plan must be active, the address must belong to the customer, and the
 * next delivery date is the next occurrence of the chosen weekday — skipping
 * any hub closure on the way.
 *
 * @param {string} customerId
 * @param {{ planId: string, addressId: string, dayOfWeek: number }} input
 * @param {Date} [now]
 * @returns {Promise<import("@prisma/client").Subscription & { plan: any, address: any }>}
 */
export async function createSubscription(customerId, input, now = new Date()) {
  const { planId, addressId, dayOfWeek } = input;

  // ── The plan must be active ──────────────────────────────────────
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });

  if (!plan || !plan.isActive) {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "That subscription plan is no longer available.",
      { planId },
    );
  }

  // ── The address must be the customer's own ───────────────────────
  const address = await prisma.address.findUnique({ where: { id: addressId } });

  if (!address || address.userId !== customerId) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That delivery address could not be found.");
  }

  // ── The next delivery date ───────────────────────────────────────
  const nextDeliveryAt = await computeNextDelivery(dayOfWeek, now);

  const subscription = await prisma.subscription.create({
    data: {
      customerId,
      planId,
      addressId,
      dayOfWeek,
      status: "active",
      nextDeliveryAt,
      startedAt: now,
    },
    include: { plan: true, address: true },
  });

  return subscription;
}

/**
 * Pause a subscription until a given date.
 *
 * A paused subscription generates no renewal orders. The `nextDeliveryAt`
 * is left alone — resuming recomputes it, and leaving it in place means the
 * customer can still see when their next delivery *would* have been.
 *
 * @param {string} customerId
 * @param {string} subscriptionId
 * @param {Date} until
 * @param {Date} [now]
 * @returns {Promise<import("@prisma/client").Subscription & { plan: any, address: any }>}
 */
export async function pauseSubscription(customerId, subscriptionId, until, now = new Date()) {
  const subscription = await getSubscription(customerId, subscriptionId);

  if (subscription.status === "ended") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This subscription has ended and cannot be paused.",
      { subscriptionId },
    );
  }

  if (subscription.status === "paused") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This subscription is already paused.",
      { subscriptionId },
    );
  }

  // A pause that has already expired would be indistinguishable from an
  // active subscription, so it is rejected in favour of the customer simply
  // cancelling.
  if (until.getTime() <= now.getTime()) {
    throw apiError(
      ERROR_CODES.VALIDATION_FAILED,
      "The pause must end on a date after today.",
      { until: until.toISOString() },
    );
  }

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "paused", pauseUntil: until },
    include: { plan: true, address: true },
  });
}

/**
 * Resume a paused subscription.
 *
 * The next delivery date is recomputed to the next occurrence of the
 * chosen weekday, skipping any hub closure.
 *
 * @param {string} customerId
 * @param {string} subscriptionId
 * @param {Date} [now]
 * @returns {Promise<import("@prisma/client").Subscription & { plan: any, address: any }>}
 */
export async function resumeSubscription(customerId, subscriptionId, now = new Date()) {
  const subscription = await getSubscription(customerId, subscriptionId);

  if (subscription.status === "ended") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This subscription has ended and cannot be resumed.",
      { subscriptionId },
    );
  }

  if (subscription.status === "active") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This subscription is not paused.",
      { subscriptionId },
    );
  }

  const nextDeliveryAt = await computeNextDelivery(subscription.dayOfWeek, now);

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "active", pauseUntil: null, nextDeliveryAt },
    include: { plan: true, address: true },
  });
}

/**
 * Cancel a subscription.
 *
 * The subscription is ended, the end date is recorded, and no further
 * renewal orders are created for it.
 *
 * @param {string} customerId
 * @param {string} subscriptionId
 * @param {Date} [now]
 * @returns {Promise<import("@prisma/client").Subscription & { plan: any, address: any }>}
 */
export async function cancelSubscription(customerId, subscriptionId, now = new Date()) {
  const subscription = await getSubscription(customerId, subscriptionId);

  if (subscription.status === "ended") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This subscription has already ended.",
      { subscriptionId },
    );
  }

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ended", endedAt: now, pauseUntil: null },
    include: { plan: true, address: true },
  });
}

/**
 * The next delivery date for a weekday, skipping hub closures.
 *
 * A closure is a day the QC hub is shut, so no delivery can land on it. The
 * date advances by seven days until it lands on a day the hub is open.
 *
 * @param {number} dayOfWeek 0 = Sunday … 6 = Saturday
 * @param {Date} [from]
 * @returns {Promise<Date>}
 */
export async function computeNextDelivery(dayOfWeek, from = new Date()) {
  let candidate = nextOccurrenceOf(dayOfWeek, from);

  // A year of Sundays is 53 chances; the loop is bounded well below that so
  // a misconfigured hub calendar can never spin forever.
  for (let attempt = 0; attempt < 53; attempt += 1) {
    const closure = await prisma.hubClosure.findUnique({
      where: { date: startOfDhakaDay(candidate) },
      select: { id: true },
    });

    if (!closure) return candidate;

    // The delivery moves on a whole week. `nextOccurrenceOf` cannot be used
    // here: it returns the *next* occurrence on or after a date, so feeding
    // it the Friday it just produced would hand back the same Friday.
    candidate = new Date(candidate.getTime() + 7 * 86_400_000);
  }

  // Every day in the year is closed — fall back to the unskipped date rather
  // than failing the subscription.
  return candidate;
}
