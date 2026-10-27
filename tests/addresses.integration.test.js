import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createAddress,
  getAddress,
  listAddresses,
} from "@/lib/services/addresses";
import { validateAddressInput } from "@/lib/validation/address";

/**
 * Integration tests for the delivery-address service and its validator.
 *
 * The checkout quick-form posts to `/api/addresses`, so these cover the
 * behaviour that form depends on: a valid address is saved, the first one
 * becomes the default, and one customer can never read another's address.
 */

let customer;
let otherCustomer;

/** @type {import("@prisma/client").Address[]} */
const created = [];

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.address@test.local",
      passwordHash: "x",
      name: "Address Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.address.other@test.local",
      passwordHash: "x",
      name: "Other Address Customer",
      role: "customer",
    },
  });
});

beforeEach(async () => {
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });
  created.length = 0;
});

describe("validateAddressInput", () => {
  it("accepts a minimal address and defaults the label and city", () => {
    const result = validateAddressInput({
      line1: "House 10, Road 5",
      area: "Gulshan-2",
    });

    expect(result.success).toBe(true);
    expect(result.data.label).toBe("Home");
    expect(result.data.city).toBe("Dhaka");
    expect(result.data.line1).toBe("House 10, Road 5");
    expect(result.data.line2).toBeUndefined();
    expect(result.data.deliveryNotes).toBeUndefined();
  });

  it("trims whitespace from every field", () => {
    const result = validateAddressInput({
      label: "  Office  ",
      line1: "  Flat 4B  ",
      line2: "  Near the mosque  ",
      area: "  Banani  ",
      city: "  Dhaka  ",
      deliveryNotes: "  Ring the bell  ",
    });

    expect(result.success).toBe(true);
    expect(result.data.label).toBe("Office");
    expect(result.data.line2).toBe("Near the mosque");
    expect(result.data.area).toBe("Banani");
    expect(result.data.deliveryNotes).toBe("Ring the bell");
  });

  it("rejects a missing street line", () => {
    const result = validateAddressInput({ area: "Gulshan-2" });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("line1");
  });

  it("rejects a missing area", () => {
    const result = validateAddressInput({ line1: "House 10, Road 5" });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("area");
  });

  it("rejects a street line that is too short", () => {
    const result = validateAddressInput({ line1: "x", area: "Gulshan-2" });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("line1");
  });

  it("rejects a non-string field", () => {
    const result = validateAddressInput({
      line1: 42,
      area: "Gulshan-2",
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("line1");
  });

  it("rejects an over-long delivery note", () => {
    const result = validateAddressInput({
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      deliveryNotes: "x".repeat(301),
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain("deliveryNotes");
  });

  it("treats an empty optional string as absent", () => {
    const result = validateAddressInput({
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      line2: "   ",
    });

    expect(result.success).toBe(true);
    expect(result.data.line2).toBeUndefined();
  });
});

describe("createAddress", () => {
  it("saves an address for the customer", async () => {
    const address = await createAddress(customer.id, {
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    });

    created.push(address);

    expect(address.userId).toBe(customer.id);
    expect(address.line1).toBe("House 10, Road 5");
    expect(address.city).toBe("Dhaka");
  });

  it("makes the first saved address the default", async () => {
    const address = await createAddress(customer.id, {
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    });

    created.push(address);

    expect(address.isDefault).toBe(true);
  });

  it("does not make later addresses default", async () => {
    const first = await createAddress(customer.id, {
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    });
    const second = await createAddress(customer.id, {
      label: "Office",
      line1: "House 2, Road 9",
      area: "Banani",
      city: "Dhaka",
    });

    created.push(first, second);

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
  });

  it("stores absent optional fields as null", async () => {
    const address = await createAddress(customer.id, {
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    });

    created.push(address);

    expect(address.line2).toBeNull();
    expect(address.deliveryNotes).toBeNull();
  });
});

describe("listAddresses", () => {
  it("returns only the customer's own addresses", async () => {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Mine",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const theirs = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Theirs",
        line1: "House 3, Road 1",
        area: "Dhanmondi",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const list = await listAddresses(customer.id);

    expect(list.map((a) => a.id)).not.toContain(theirs.id);
    expect(list.every((a) => a.userId === customer.id)).toBe(true);
  });

  it("lists the default address first", async () => {
    const second = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Office",
        line1: "House 2, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: false,
      },
    });

    const first = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const list = await listAddresses(customer.id);

    expect(list[0].id).toBe(first.id);
    expect(list.map((a) => a.id)).toContain(second.id);
  });

  it("returns an empty array when the customer has none", async () => {
    const list = await listAddresses(otherCustomer.id);

    expect(list).toEqual([]);
  });
});

describe("getAddress", () => {
  it("returns the customer's own address", async () => {
    const address = await createAddress(customer.id, {
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    });

    const found = await getAddress(customer.id, address.id);

    expect(found.id).toBe(address.id);
  });

  it("reports another customer's address as not found", async () => {
    const address = await createAddress(otherCustomer.id, {
      label: "Theirs",
      line1: "House 3, Road 1",
      area: "Dhanmondi",
      city: "Dhaka",
    });

    await expect(getAddress(customer.id, address.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reports an unknown id as not found", async () => {
    await expect(getAddress(customer.id, "no-such-address")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
