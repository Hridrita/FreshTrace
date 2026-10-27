import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createAddress,
  deleteAddress,
  getAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/services/addresses";
import { getProfile, updateProfile } from "@/lib/services/profile";
import { validateProfileInput } from "@/lib/validation/profile";

/**
 * Integration tests for the account page's writes.
 *
 * The account page lets a customer edit their display name and manage their
 * delivery addresses. These cover the behaviour it depends on:
 *
 * - an address can be edited, deleted and made the default;
 * - another customer's address is never reachable;
 * - an address used by a live subscription is protected from deletion
 *   (openspec `subscription-management` — "Address Protection for Active
 *   Subscriptions");
 * - the profile's display name can be changed, and the email cannot.
 */

let customer;
let otherCustomer;
let plan;

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.account@test.local",
      passwordHash: "x",
      name: "Account Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.account.other@test.local",
      passwordHash: "x",
      name: "Other Account Customer",
      role: "customer",
    },
  });

  // The test database is migrated but not seeded, so there may be no plan to
  // subscribe to.
  plan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true } });

  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: "Account Test Plan",
        basketSize: "small",
        weeklyPrice: 650,
        composition: "[]",
        isActive: true,
      },
    });
  }
});

beforeEach(async () => {
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });
});

/**
 * A valid address payload.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function addressInput(overrides = {}) {
  return {
    label: "Home",
    line1: "House 10, Road 5",
    area: "Gulshan-2",
    city: "Dhaka",
    ...overrides,
  };
}

describe("updateAddress", () => {
  it("writes the changed fields", async () => {
    const address = await createAddress(customer.id, addressInput());

    const updated = await updateAddress(customer.id, address.id, addressInput({
      label: "Office",
      line1: "Flat 4B, Banani",
      area: "Banani",
    }));

    expect(updated.label).toBe("Office");
    expect(updated.line1).toBe("Flat 4B, Banani");
    expect(updated.area).toBe("Banani");
  });

  it("clears an emptied optional field rather than keeping the old value", async () => {
    const address = await createAddress(
      customer.id,
      addressInput({ line2: "Flat 4B", deliveryNotes: "Ring the bell" }),
    );

    const updated = await updateAddress(
      customer.id,
      address.id,
      addressInput({ line2: "", deliveryNotes: "" }),
    );

    expect(updated.line2).toBeNull();
    expect(updated.deliveryNotes).toBeNull();
  });

  it("keeps the address's default flag", async () => {
    const address = await createAddress(customer.id, addressInput());

    const updated = await updateAddress(customer.id, address.id, addressInput({
      label: "Renamed",
    }));

    expect(updated.isDefault).toBe(true);
  });

  it("reports another customer's address as not found", async () => {
    const address = await createAddress(otherCustomer.id, addressInput());

    await expect(
      updateAddress(customer.id, address.id, addressInput()),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports an unknown id as not found", async () => {
    await expect(
      updateAddress(customer.id, "no-such-address", addressInput()),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("setDefaultAddress", () => {
  it("moves the default from the old address to the new one", async () => {
    const first = await createAddress(customer.id, addressInput());
    const second = await createAddress(customer.id, addressInput({ label: "Office" }));

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    await setDefaultAddress(customer.id, second.id);

    const list = await prisma.address.findMany({
      where: { userId: customer.id },
      orderBy: { createdAt: "asc" },
    });

    expect(list[0].isDefault).toBe(false);
    expect(list[1].isDefault).toBe(true);
  });

  it("reports another customer's address as not found", async () => {
    const address = await createAddress(otherCustomer.id, addressInput());

    await expect(
      setDefaultAddress(customer.id, address.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleteAddress", () => {
  it("deletes an unreferenced address", async () => {
    const address = await createAddress(customer.id, addressInput());

    const result = await deleteAddress(customer.id, address.id);

    expect(result.id).toBe(address.id);

    const remaining = await prisma.address.count({
      where: { userId: customer.id },
    });

    expect(remaining).toBe(0);
  });

  it("promotes the oldest remaining address when the default is deleted", async () => {
    const first = await createAddress(customer.id, addressInput());
    const second = await createAddress(customer.id, addressInput({ label: "Office" }));

    await deleteAddress(customer.id, first.id);

    const remaining = await prisma.address.findFirst({
      where: { userId: customer.id },
    });

    expect(remaining.id).toBe(second.id);
    expect(remaining.isDefault).toBe(true);
  });

  it("refuses to delete an address an active subscription uses", async () => {
    const address = await createAddress(customer.id, addressInput());

    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "active",
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    await expect(deleteAddress(customer.id, address.id)).rejects.toMatchObject({
      code: "conflict",
    });

    // The address must survive the rejected delete.
    const stillThere = await getAddress(customer.id, address.id);
    expect(stillThere.id).toBe(address.id);

    await prisma.subscription.delete({ where: { id: subscription.id } });
  });

  it("refuses to delete an address a paused subscription uses", async () => {
    const address = await createAddress(customer.id, addressInput());

    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "paused",
        pauseUntil: new Date(Date.now() + 7 * 86_400_000),
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    await expect(deleteAddress(customer.id, address.id)).rejects.toMatchObject({
      code: "conflict",
    });

    await prisma.subscription.delete({ where: { id: subscription.id } });
  });

  it("names the blocking subscriptions in the conflict details", async () => {
    const address = await createAddress(customer.id, addressInput());

    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "active",
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    await expect(deleteAddress(customer.id, address.id)).rejects.toMatchObject({
      code: "conflict",
      details: { subscriptionIds: [subscription.id] },
    });

    await prisma.subscription.delete({ where: { id: subscription.id } });
  });

  it("allows deleting an address only ended subscriptions use", async () => {
    const address = await createAddress(customer.id, addressInput());

    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "ended",
        endedAt: new Date(),
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    await expect(deleteAddress(customer.id, address.id)).resolves.toMatchObject({
      id: address.id,
    });

    const remaining = await prisma.address.count({
      where: { userId: customer.id },
    });

    expect(remaining).toBe(0);
  });

  it("reports another customer's address as not found", async () => {
    const address = await createAddress(otherCustomer.id, addressInput());

    await expect(
      deleteAddress(customer.id, address.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("validateProfileInput", () => {
  it("accepts a name", () => {
    const result = validateProfileInput({ name: "Tareq Rahman" });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Tareq Rahman");
  });

  it("trims the name", () => {
    const result = validateProfileInput({ name: "  Tareq Rahman  " });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Tareq Rahman");
  });

  it("rejects a name that is too short", () => {
    const result = validateProfileInput({ name: "A" });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("name");
  });

  it("rejects a missing name", () => {
    const result = validateProfileInput({});

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("name");
  });

  it("ignores an email that is sent along with the name", () => {
    const result = validateProfileInput({
      name: "Tareq Rahman",
      email: "hijack@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.data.email).toBeUndefined();
  });
});

describe("getProfile", () => {
  it("returns the profile's own fields", async () => {
    const profile = await getProfile(customer.id);

    expect(profile.id).toBe(customer.id);
    expect(profile.email).toBe("customer.account@test.local");
  });

  it("never returns the password hash", async () => {
    const profile = await getProfile(customer.id);

    expect(profile.passwordHash).toBeUndefined();
  });

  it("returns null for an unknown user", async () => {
    expect(await getProfile("no-such-user")).toBeNull();
  });
});

describe("updateProfile", () => {
  it("writes the display name", async () => {
    const updated = await updateProfile(customer.id, { name: "Tareq Rahman" });

    expect(updated.name).toBe("Tareq Rahman");
  });

  it("leaves the email untouched", async () => {
    await updateProfile(customer.id, { name: "Tareq Rahman" });

    const user = await prisma.user.findUnique({ where: { id: customer.id } });

    expect(user.email).toBe("customer.account@test.local");
  });

  it("leaves the role untouched", async () => {
    await updateProfile(customer.id, { name: "Tareq Rahman" });

    const user = await prisma.user.findUnique({ where: { id: customer.id } });

    expect(user.role).toBe("customer");
  });

  it("never returns the password hash", async () => {
    const updated = await updateProfile(customer.id, { name: "Tareq Rahman" });

    expect(updated.passwordHash).toBeUndefined();
  });
});
