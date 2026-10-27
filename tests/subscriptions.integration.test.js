import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  cancelSubscription,
  computeNextDelivery,
  createSubscription,
  dayOfWeekInDhaka,
  getCurrentSubscription,
  getSubscription,
  listActivePlans,
  listSubscriptions,
  nextOccurrenceOf,
  parseComposition,
  pauseSubscription,
  resumeSubscription,
  startOfDhakaDay,
} from "@/lib/services/subscriptions";
import {
  validateCreateSubscriptionInput,
  validatePauseSubscriptionInput,
  validateSubscriptionStatusFilter,
} from "@/lib/validation/subscription";

/**
 * Integration tests for the subscription service and its validator.
 *
 * SRS §4.7–§4.8 and the `subscription-management` spec: a subscription is
 * a weekly basket on a fixed weekday, with an `active` → `paused` → `active`
 * lifecycle and a terminal `ended` state.
 */

const DAY_MS = 86_400_000;

/**
 * Midnight Dhaka time on Friday 30 October 2026.
 *
 * The subscription tests use Friday as the delivery weekday. Friday 30 Oct
 * is the first Friday after the fixed "now" of Tuesday 27 Oct 2026, and
 * Friday 6 Nov is the one after it — so a closure on the 30th pushes the
 * delivery a week on. Hub closures are stored as Dhaka midnight, which is
 * what the service looks them up by.
 */
const FRIDAY_30_OCT = new Date("2026-10-29T18:00:00.000Z");

let customer;
let otherCustomer;
let plan;
let inactivePlan;
let address;
let otherAddress;

/**
 * A fixed instant used as "now" in the tests, so the date arithmetic is
 * deterministic.
 *
 * @param {number} daysAgo
 * @returns {Date}
 */
function daysAgo(daysAgo) {
  return new Date(Date.now() - daysAgo * DAY_MS);
}

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.subs@test.local",
      passwordHash: "x",
      name: "Subscription Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.subs.other@test.local",
      passwordHash: "x",
      name: "Other Subscription Customer",
      role: "customer",
    },
  });

  plan = await prisma.subscriptionPlan.create({
    data: {
      name: "Test Weekly",
      basketSize: "medium",
      weeklyPrice: 1200,
      description: "A medium basket.",
      composition: JSON.stringify([{ productId: "product-a", defaultQty: 1.5 }]),
      isActive: true,
    },
  });

  inactivePlan = await prisma.subscriptionPlan.create({
    data: {
      name: "Retired Weekly",
      basketSize: "small",
      weeklyPrice: 600,
      composition: "[]",
      isActive: false,
    },
  });

  address = await prisma.address.create({
    data: {
      userId: customer.id,
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
      isDefault: true,
    },
  });

  otherAddress = await prisma.address.create({
    data: {
      userId: otherCustomer.id,
      label: "Theirs",
      line1: "House 3, Road 1",
      area: "Dhanmondi",
      city: "Dhaka",
      isDefault: true,
    },
  });
});

beforeEach(async () => {
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.hubClosure.deleteMany({});
});

describe("date helpers", () => {
  it("finds the start of the Dhaka day", () => {
    const start = startOfDhakaDay(new Date("2026-10-27T09:30:00.000Z"));

    // 09:30 UTC is 15:30 Dhaka on Tue 27 Oct, so the day starts at 18:00 UTC
    // on Mon 26 Oct.
    expect(start.toISOString()).toBe("2026-10-26T18:00:00.000Z");
  });

  it("reads the weekday in Dhaka, not UTC", () => {
    // 20:00 UTC on Mon 26 Oct is 02:00 on Tue 27 Oct in Dhaka.
    expect(dayOfWeekInDhaka(new Date("2026-10-26T20:00:00.000Z"))).toBe(2);
  });

  it("returns today when today is the wanted weekday", () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    const next = nextOccurrenceOf(2, now);

    expect(startOfDhakaDay(next).toISOString()).toBe("2026-10-26T18:00:00.000Z");
  });

  it("advances to the next occurrence when the weekday differs", () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    const next = nextOccurrenceOf(5, now); // Friday

    expect(startOfDhakaDay(next).toISOString()).toBe("2026-10-29T18:00:00.000Z");
  });

  it("wraps to the following week across the Sunday boundary", () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    const next = nextOccurrenceOf(0, now); // Sunday

    // Sunday 1 Nov starts at 18:00 UTC on Saturday 31 Oct.
    expect(startOfDhakaDay(next).toISOString()).toBe("2026-10-31T18:00:00.000Z");
  });
});

describe("parseComposition", () => {
  it("parses a valid composition", () => {
    const result = parseComposition(
      JSON.stringify([{ productId: "p1", defaultQty: 2 }]),
    );

    expect(result).toEqual([{ productId: "p1", defaultQty: 2 }]);
  });

  it("returns an empty list for malformed JSON", () => {
    expect(parseComposition("{not json")).toEqual([]);
  });

  it("returns an empty list for a non-array", () => {
    expect(parseComposition('{"productId":"p1"}')).toEqual([]);
  });

  it("returns an empty list for a null composition", () => {
    expect(parseComposition(null)).toEqual([]);
  });

  it("drops entries with a non-positive quantity", () => {
    const result = parseComposition(
      JSON.stringify([
        { productId: "p1", defaultQty: 0 },
        { productId: "p2", defaultQty: 1 },
      ]),
    );

    expect(result).toEqual([{ productId: "p2", defaultQty: 1 }]);
  });
});

describe("listActivePlans", () => {
  it("returns only active plans", async () => {
    const plans = await listActivePlans();
    const ids = plans.map((p) => p.id);

    expect(ids).toContain(plan.id);
    expect(ids).not.toContain(inactivePlan.id);
  });

  it("orders plans by price, cheapest first", async () => {
    const plans = await listActivePlans();
    const prices = plans.map((p) => p.weeklyPrice);

    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe("createSubscription", () => {
  it("creates an active subscription on the chosen weekday", async () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    const subscription = await createSubscription(
      customer.id,
      { planId: plan.id, addressId: address.id, dayOfWeek: 5 },
      now,
    );

    expect(subscription.status).toBe("active");
    expect(subscription.dayOfWeek).toBe(5);
    expect(subscription.customerId).toBe(customer.id);
    expect(subscription.planId).toBe(plan.id);
    expect(subscription.startedAt).toEqual(now);
  });

  it("sets the next delivery to the next occurrence of the weekday", async () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    const subscription = await createSubscription(
      customer.id,
      { planId: plan.id, addressId: address.id, dayOfWeek: 5 },
      now,
    );

    expect(startOfDhakaDay(subscription.nextDeliveryAt).toISOString()).toBe(
      "2026-10-29T18:00:00.000Z",
    );
  });

  it("rejects a subscription to an inactive plan", async () => {
    await expect(
      createSubscription(customer.id, {
        planId: inactivePlan.id,
        addressId: address.id,
        dayOfWeek: 5,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects an address belonging to another customer", async () => {
    await expect(
      createSubscription(customer.id, {
        planId: plan.id,
        addressId: otherAddress.id,
        dayOfWeek: 5,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("skips a hub closure on the delivery date", async () => {
    const now = new Date("2026-10-27T09:00:00.000Z"); // Tuesday
    await prisma.hubClosure.create({
      data: { date: FRIDAY_30_OCT, reason: "public_holiday" },
    });

    const subscription = await createSubscription(
      customer.id,
      { planId: plan.id, addressId: address.id, dayOfWeek: 5 },
      now,
    );

    // Friday is closed, so the delivery lands the following Friday.
    expect(startOfDhakaDay(subscription.nextDeliveryAt).toISOString()).toBe(
      "2026-11-05T18:00:00.000Z",
    );
  });
});

describe("computeNextDelivery", () => {
  it("skips a closure and advances by seven days", async () => {
    await prisma.hubClosure.create({
      data: { date: FRIDAY_30_OCT, reason: "weather" },
    });

    const next = await computeNextDelivery(5, new Date("2026-10-27T09:00:00.000Z"));

    expect(startOfDhakaDay(next).toISOString()).toBe("2026-11-05T18:00:00.000Z");
  });

  it("returns the plain occurrence when no closure applies", async () => {
    const next = await computeNextDelivery(5, new Date("2026-10-27T09:00:00.000Z"));

    expect(startOfDhakaDay(next).toISOString()).toBe("2026-10-29T18:00:00.000Z");
  });
});

describe("listSubscriptions", () => {
  it("returns only the customer's own subscriptions", async () => {
    await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await createSubscription(otherCustomer.id, {
      planId: plan.id,
      addressId: otherAddress.id,
      dayOfWeek: 5,
    });

    const list = await listSubscriptions(customer.id);

    expect(list).toHaveLength(1);
    expect(list[0].customerId).toBe(customer.id);
  });

  it("filters by status", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    expect(await listSubscriptions(customer.id, { status: "paused" })).toHaveLength(1);
    expect(await listSubscriptions(customer.id, { status: "active" })).toHaveLength(0);
  });
});

describe("getCurrentSubscription", () => {
  it("returns the active subscription", async () => {
    await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    const current = await getCurrentSubscription(customer.id);

    expect(current).not.toBeNull();
    expect(current.status).toBe("active");
  });

  it("returns a paused subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    const current = await getCurrentSubscription(customer.id);

    expect(current.status).toBe("paused");
  });

  it("returns null when the only subscription has ended", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await cancelSubscription(customer.id, subscription.id);

    expect(await getCurrentSubscription(customer.id)).toBeNull();
  });

  it("returns null when the customer has none", async () => {
    expect(await getCurrentSubscription(customer.id)).toBeNull();
  });
});

describe("getSubscription", () => {
  it("returns the customer's own subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    const found = await getSubscription(customer.id, subscription.id);

    expect(found.id).toBe(subscription.id);
    expect(found.plan.id).toBe(plan.id);
    expect(found.address.id).toBe(address.id);
  });

  it("reports another customer's subscription as not found", async () => {
    const subscription = await createSubscription(otherCustomer.id, {
      planId: plan.id,
      addressId: otherAddress.id,
      dayOfWeek: 5,
    });

    await expect(
      getSubscription(customer.id, subscription.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("pauseSubscription", () => {
  it("pauses an active subscription and records the until date", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    const until = daysAgo(-7);
    const paused = await pauseSubscription(customer.id, subscription.id, until);

    expect(paused.status).toBe("paused");
    expect(paused.pauseUntil).toEqual(until);
  });

  it("rejects pausing an already paused subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    await expect(
      pauseSubscription(customer.id, subscription.id, daysAgo(-14)),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects a pause that has already ended", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    await expect(
      pauseSubscription(customer.id, subscription.id, daysAgo(3)),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("rejects pausing another customer's subscription", async () => {
    const subscription = await createSubscription(otherCustomer.id, {
      planId: plan.id,
      addressId: otherAddress.id,
      dayOfWeek: 5,
    });

    await expect(
      pauseSubscription(customer.id, subscription.id, daysAgo(-7)),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("resumeSubscription", () => {
  it("resumes a paused subscription and clears the pause date", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    const resumed = await resumeSubscription(customer.id, subscription.id);

    expect(resumed.status).toBe("active");
    expect(resumed.pauseUntil).toBeNull();
  });

  it("recomputes the next delivery date on resume", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    const resumed = await resumeSubscription(
      customer.id,
      subscription.id,
      new Date("2026-10-27T09:00:00.000Z"),
    );

    expect(startOfDhakaDay(resumed.nextDeliveryAt).toISOString()).toBe(
      "2026-10-29T18:00:00.000Z",
    );
  });

  it("skips a hub closure when recomputing the delivery date", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    await prisma.hubClosure.create({
      data: {
        date: FRIDAY_30_OCT,
        reason: "public_holiday",
      },
    });

    const resumed = await resumeSubscription(
      customer.id,
      subscription.id,
      new Date("2026-10-27T09:00:00.000Z"),
    );

    expect(startOfDhakaDay(resumed.nextDeliveryAt).toISOString()).toBe(
      "2026-11-05T18:00:00.000Z",
    );
  });

  it("rejects resuming an active subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    await expect(
      resumeSubscription(customer.id, subscription.id),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("cancelSubscription", () => {
  it("ends an active subscription and records the end date", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });

    const now = new Date();
    const cancelled = await cancelSubscription(customer.id, subscription.id, now);

    expect(cancelled.status).toBe("ended");
    expect(cancelled.endedAt).toEqual(now);
  });

  it("ends a paused subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await pauseSubscription(customer.id, subscription.id, daysAgo(-7));

    const cancelled = await cancelSubscription(customer.id, subscription.id);

    expect(cancelled.status).toBe("ended");
    expect(cancelled.pauseUntil).toBeNull();
  });

  it("rejects cancelling an already ended subscription", async () => {
    const subscription = await createSubscription(customer.id, {
      planId: plan.id,
      addressId: address.id,
      dayOfWeek: 5,
    });
    await cancelSubscription(customer.id, subscription.id);

    await expect(
      cancelSubscription(customer.id, subscription.id),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects cancelling another customer's subscription", async () => {
    const subscription = await createSubscription(otherCustomer.id, {
      planId: plan.id,
      addressId: otherAddress.id,
      dayOfWeek: 5,
    });

    await expect(
      cancelSubscription(customer.id, subscription.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("validateCreateSubscriptionInput", () => {
  it("accepts a valid body", () => {
    const result = validateCreateSubscriptionInput({
      planId: "plan-1",
      addressId: "address-1",
      dayOfWeek: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      planId: "plan-1",
      addressId: "address-1",
      dayOfWeek: 3,
    });
  });

  it("rejects a missing plan id", () => {
    const result = validateCreateSubscriptionInput({
      addressId: "address-1",
      dayOfWeek: 3,
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("planId");
  });

  it("rejects a weekday outside 0…6", () => {
    const result = validateCreateSubscriptionInput({
      planId: "plan-1",
      addressId: "address-1",
      dayOfWeek: 7,
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("dayOfWeek");
  });

  it("rejects a non-integer weekday", () => {
    const result = validateCreateSubscriptionInput({
      planId: "plan-1",
      addressId: "address-1",
      dayOfWeek: 1.5,
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("dayOfWeek");
  });

  it("rejects a missing address id", () => {
    const result = validateCreateSubscriptionInput({
      planId: "plan-1",
      dayOfWeek: 3,
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("addressId");
  });
});

describe("validatePauseSubscriptionInput", () => {
  it("accepts a bare date", () => {
    const result = validatePauseSubscriptionInput({ until: "2026-11-10" });

    expect(result.success).toBe(true);
    expect(result.data.until.toISOString()).toBe("2026-11-09T18:00:00.000Z");
  });

  it("accepts an ISO timestamp", () => {
    const result = validatePauseSubscriptionInput({ until: "2026-11-10T00:00:00.000Z" });

    expect(result.success).toBe(true);
    expect(result.data.until.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("rejects a missing date", () => {
    const result = validatePauseSubscriptionInput({});

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("until");
  });

  it("rejects an unparseable date", () => {
    const result = validatePauseSubscriptionInput({ until: "not-a-date" });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("until");
  });
});

describe("validateSubscriptionStatusFilter", () => {
  it("treats an absent status as no filter", () => {
    const result = validateSubscriptionStatusFilter(undefined);

    expect(result.success).toBe(true);
    expect(result.data.status).toBeUndefined();
  });

  it("accepts a known status", () => {
    const result = validateSubscriptionStatusFilter("paused");

    expect(result.success).toBe(true);
    expect(result.data.status).toBe("paused");
  });

  it("rejects an unknown status", () => {
    const result = validateSubscriptionStatusFilter("cancelled");

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("status");
  });
});
