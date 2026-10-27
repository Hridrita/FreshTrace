import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";

/**
 * Integration tests for the account page's API routes.
 *
 * - `GET|PATCH|DELETE /api/addresses/:id` and `POST /api/addresses/:id`
 * - `GET|PATCH /api/profile`
 *
 * The `next/headers` cookie store is mocked so the handlers can be invoked
 * outside a request scope, but the session itself is a real row — the
 * routes' behaviour depends on it.
 */

const cookieState = { token: undefined };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name) =>
      name === "ft_session" && cookieState.token
        ? { name, value: cookieState.token }
        : undefined,
    set: () => {},
    delete: () => {},
  })),
}));

const { GET: getAddressRoute, PATCH: patchAddressRoute, DELETE: deleteAddressRoute, POST: postAddressRoute } =
  await import("@/app/api/addresses/[id]/route");
const { GET: getProfileRoute, PATCH: patchProfileRoute } = await import(
  "@/app/api/profile/route"
);

let customer;
let otherCustomer;
let plan;

/**
 * Build a request for a route.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Request}
 */
function makeRequest(url, init = {}) {
  return new Request(`http://localhost${url}`, init);
}

/**
 * Build the route context Next.js passes to a dynamic route.
 *
 * @param {string} id
 * @returns {{ params: Promise<{ id: string }> }}
 */
function context(id) {
  return { params: Promise.resolve({ id }) };
}

/**
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function body(response) {
  return response.json();
}

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.account.routes@test.local",
      passwordHash: "x",
      name: "Account Routes Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.account.routes.other@test.local",
      passwordHash: "x",
      name: "Other Account Routes Customer",
      role: "customer",
    },
  });

  plan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true } });

  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: "Account Routes Plan",
        basketSize: "small",
        weeklyPrice: 650,
        composition: "[]",
        isActive: true,
      },
    });
  }
});

afterAll(async () => {
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.session.deleteMany({ where: { userId: customer.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [customer.id, otherCustomer.id] } },
  });
});

beforeEach(async () => {
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });

  const { token } = await createSession(customer.id);
  cookieState.token = token;
});

describe("GET /api/addresses/:id", () => {
  it("returns the customer's own address", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await getAddressRoute(
      makeRequest(`/api/addresses/${address.id}`),
      context(address.id),
    );

    expect(response.status).toBe(200);

    const json = await body(response);
    expect(json.data.id).toBe(address.id);
    expect(json.data.line1).toBe("House 10, Road 5");
  });

  it("reports another customer's address as not found", async () => {
    const address = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await getAddressRoute(
      makeRequest(`/api/addresses/${address.id}`),
      context(address.id),
    );

    expect(response.status).toBe(404);
    expect((await body(response)).error.code).toBe("not_found");
  });

  it("rejects a signed-out caller", async () => {
    cookieState.token = undefined;

    const response = await getAddressRoute(
      makeRequest("/api/addresses/anything"),
      context("anything"),
    );

    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe("unauthenticated");
  });
});

describe("PATCH /api/addresses/:id", () => {
  it("writes the changed fields", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await patchAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Office",
          line1: "Flat 4B, Banani",
          area: "Banani",
        }),
      }),
      context(address.id),
    );

    expect(response.status).toBe(200);

    const json = await body(response);
    expect(json.data.label).toBe("Office");
    expect(json.data.line1).toBe("Flat 4B, Banani");
    expect(json.data.area).toBe("Banani");
    expect(json.data.isDefault).toBe(true);
  });

  it("clears an emptied optional field", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        line2: "Flat 4B",
        area: "Gulshan-2",
        city: "Dhaka",
        deliveryNotes: "Ring the bell",
        isDefault: true,
      },
    });

    const response = await patchAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Home",
          line1: "House 10, Road 5",
          line2: "",
          area: "Gulshan-2",
          deliveryNotes: "",
        }),
      }),
      context(address.id),
    );

    expect(response.status).toBe(200);

    const json = await body(response);
    expect(json.data.line2).toBeNull();
    expect(json.data.deliveryNotes).toBeNull();
  });

  it("rejects an invalid address with a validation error", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await patchAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line1: "x", area: "Gulshan-2" }),
      }),
      context(address.id),
    );

    expect(response.status).toBe(422);
    expect((await body(response)).error.code).toBe("validation_failed");
  });

  it("rejects a body that is not JSON", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await patchAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      context(address.id),
    );

    expect(response.status).toBe(422);
    expect((await body(response)).error.code).toBe("validation_failed");
  });

  it("reports another customer's address as not found", async () => {
    const address = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await patchAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Hijacked",
          line1: "House 99, Road 9",
          area: "Banani",
        }),
      }),
      context(address.id),
    );

    expect(response.status).toBe(404);
    expect((await body(response)).error.code).toBe("not_found");
  });
});

describe("POST /api/addresses/:id", () => {
  it("moves the default to the chosen address", async () => {
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

    const second = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Office",
        line1: "Flat 4B, Banani",
        area: "Banani",
        city: "Dhaka",
        isDefault: false,
      },
    });

    const response = await postAddressRoute(
      makeRequest(`/api/addresses/${second.id}`, { method: "POST" }),
      context(second.id),
    );

    expect(response.status).toBe(200);
    expect((await body(response)).data.isDefault).toBe(true);

    const list = await prisma.address.findMany({
      where: { userId: customer.id },
      orderBy: { createdAt: "asc" },
    });

    expect(list.find((a) => a.id === first.id).isDefault).toBe(false);
    expect(list.find((a) => a.id === second.id).isDefault).toBe(true);
  });

  it("reports another customer's address as not found", async () => {
    const address = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await postAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, { method: "POST" }),
      context(address.id),
    );

    expect(response.status).toBe(404);
    expect((await body(response)).error.code).toBe("not_found");
  });
});

describe("DELETE /api/addresses/:id", () => {
  it("deletes the address", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await deleteAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, { method: "DELETE" }),
      context(address.id),
    );

    expect(response.status).toBe(200);
    expect((await body(response)).data.id).toBe(address.id);

    expect(
      await prisma.address.count({ where: { id: address.id } }),
    ).toBe(0);
  });

  it("rejects deleting an address an active subscription uses", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

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

    const response = await deleteAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, { method: "DELETE" }),
      context(address.id),
    );

    expect(response.status).toBe(409);

    const json = await body(response);
    expect(json.error.code).toBe("conflict");
    expect(json.error.details.subscriptionIds).toContain(subscription.id);

    // The address must survive the rejected delete.
    expect(await prisma.address.count({ where: { id: address.id } })).toBe(1);
  });

  it("allows deleting an address only ended subscriptions use", async () => {
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    await prisma.subscription.create({
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

    const response = await deleteAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, { method: "DELETE" }),
      context(address.id),
    );

    expect(response.status).toBe(200);
    expect(await prisma.address.count({ where: { id: address.id } })).toBe(0);
  });

  it("reports another customer's address as not found", async () => {
    const address = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const response = await deleteAddressRoute(
      makeRequest(`/api/addresses/${address.id}`, { method: "DELETE" }),
      context(address.id),
    );

    expect(response.status).toBe(404);
    expect((await body(response)).error.code).toBe("not_found");
  });
});

describe("GET /api/profile", () => {
  it("returns the signed-in customer's profile", async () => {
    const response = await getProfileRoute(makeRequest("/api/profile"));

    expect(response.status).toBe(200);

    const json = await body(response);
    expect(json.data.id).toBe(customer.id);
    expect(json.data.email).toBe("customer.account.routes@test.local");
    expect(json.data.name).toBe("Account Routes Customer");
  });

  it("never returns the password hash", async () => {
    const response = await getProfileRoute(makeRequest("/api/profile"));

    expect((await body(response)).data.passwordHash).toBeUndefined();
  });

  it("rejects a signed-out caller", async () => {
    cookieState.token = undefined;

    const response = await getProfileRoute(makeRequest("/api/profile"));

    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe("unauthenticated");
  });
});

describe("PATCH /api/profile", () => {
  it("writes the display name", async () => {
    const response = await patchProfileRoute(
      makeRequest("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tareq Rahman" }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await body(response)).data.name).toBe("Tareq Rahman");

    const user = await prisma.user.findUnique({ where: { id: customer.id } });
    expect(user.name).toBe("Tareq Rahman");
  });

  it("leaves the email and role untouched", async () => {
    await patchProfileRoute(
      makeRequest("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tareq Rahman", email: "hijack@example.com" }),
      }),
    );

    const user = await prisma.user.findUnique({ where: { id: customer.id } });

    expect(user.email).toBe("customer.account.routes@test.local");
    expect(user.role).toBe("customer");
  });

  it("rejects a name that is too short", async () => {
    const response = await patchProfileRoute(
      makeRequest("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      }),
    );

    expect(response.status).toBe(422);
    expect((await body(response)).error.code).toBe("validation_failed");
  });

  it("rejects a missing name", async () => {
    const response = await patchProfileRoute(
      makeRequest("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(422);
    expect((await body(response)).error.code).toBe("validation_failed");
  });

  it("rejects a signed-out caller", async () => {
    cookieState.token = undefined;

    const response = await patchProfileRoute(
      makeRequest("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tareq Rahman" }),
      }),
    );

    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe("unauthenticated");
  });
});
