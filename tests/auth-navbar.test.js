import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prerender } from "react-dom/static";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Navbar session-state tests.
 *
 * `src/app/(customer)/layout.jsx` is a Server Component: it resolves the
 * session with `getSession()` and renders either the signed-out links
 * (Login / Register) or the signed-in controls (name + Log out).
 *
 * The session module is mocked so the layout can be rendered with a chosen
 * session, and `react-dom/server` turns the element tree into HTML so the
 * assertions can look at what a visitor would actually see.
 */

const sessionState = { session: null };

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(async () => sessionState.session),
  };
});

// `LogoutButton` is a Client Component that calls `useRouter()`, which needs
// a mounted App Router. The router is not under test here — only the Navbar
// that decides whether to render it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { default: CustomerLayout } = await import("@/app/(customer)/layout.jsx");

/**
 * Render the customer shell to HTML.
 *
 * The layout is an async Server Component, so it is rendered with
 * `react-dom/static`'s `prerender`, which awaits suspended work and returns
 * the markup as a stream.
 *
 * @returns {Promise<string>}
 */
async function render() {
  const { prelude } = await prerender(
    createElement(CustomerLayout, null, createElement("main", null, "catalogue")),
  );

  const chunks = [];
  const decoder = new TextDecoder();

  for await (const chunk of prelude) {
    chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
  }

  return chunks.join("");
}

/**
 * @param {string} html
 * @param {string} needle
 * @returns {boolean}
 */
function has(html, needle) {
  return html.includes(needle);
}

beforeEach(() => {
  sessionState.session = null;
});

describe("customer Navbar — signed out", () => {
  it("shows Login and Register", async () => {
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(true);
    expect(has(html, 'href="/register"')).toBe(true);
  });

  it("does not show a Log out control", async () => {
    const html = await render();

    expect(has(html, "Log out")).toBe(false);
  });

  it("links to the account page", async () => {
    const html = await render();

    // Cart, Orders, Subscriptions and Account are all real pages now, so
    // there is no unbuilt destination left in the header.
    expect(has(html, 'href="/app/account"')).toBe(true);

    expect(has(html, 'aria-disabled="true"')).toBe(false);
  });

  it("does not show the subscriptions link to a signed-out visitor", async () => {
    const html = await render();

    expect(has(html, 'href="/app/subscriptions"')).toBe(false);
  });

  it("does not show the cart badge to a signed-out visitor", async () => {
    const html = await render();

    expect(has(html, 'href="/app/cart"')).toBe(false);
  });

  it("does not show the Admin Dashboard link to a signed-out visitor", async () => {
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(false);
    expect(has(html, "Admin Dashboard")).toBe(false);
  });

  it("keeps the catalogue link live", async () => {
    expect(has(await render(), 'href="/app/products"')).toBe(true);
  });
});

describe("customer Navbar — signed in", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-1",
        name: "Smoke Tester",
        email: "smoke@test.local",
        role: "customer",
        status: "active",
      },
    };
  });

  it("shows the user's name", async () => {
    expect(has(await render(), "Smoke Tester")).toBe(true);
  });

  it("shows a Log out control instead of Login and Register", async () => {
    const html = await render();

    expect(has(html, "Log out")).toBe(true);
    expect(has(html, 'href="/login"')).toBe(false);
    expect(has(html, 'href="/register"')).toBe(false);
  });

  it("links to the cart and the order history", async () => {
    const html = await render();

    expect(has(html, 'href="/app/cart"')).toBe(true);
    expect(has(html, 'href="/app/orders"')).toBe(true);
  });

  it("links to the subscriptions page", async () => {
    const html = await render();

    expect(has(html, 'href="/app/subscriptions"')).toBe(true);
  });

  it("links to the account page", async () => {
    const html = await render();

    expect(has(html, 'href="/app/account"')).toBe(true);
  });

  it("does not mark the subscriptions link as active without a plan", async () => {
    const html = await render();

    expect(has(html, "You have an active subscription")).toBe(false);
  });

  it("does not show the Admin Dashboard link to a non-admin customer", async () => {
    // The link is gated on the account role. A customer must not see a
    // route they cannot use.
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(false);
    expect(has(html, "Admin Dashboard")).toBe(false);
  });
});

describe("customer Navbar — admin account", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-admin",
        name: "Operations Lead",
        email: "admin@freshtrace.com",
        role: "admin",
        status: "active",
      },
    };
  });

  it("shows the Admin Dashboard link", async () => {
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(true);
    expect(has(html, "Admin Dashboard")).toBe(true);
  });

  it("keeps the other signed-in links alongside it", async () => {
    const html = await render();

    expect(has(html, 'href="/app/products"')).toBe(true);
    expect(has(html, 'href="/app/orders"')).toBe(true);
    expect(has(html, 'href="/app/subscriptions"')).toBe(true);
    expect(has(html, 'href="/app/account"')).toBe(true);
  });

  it("points at the panel root, not the login page", async () => {
    // The link targets the dashboard itself. The panel's own guard decides
    // whether the visitor needs to sign in first.
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(true);
    expect(has(html, 'href="/app/admin/login"')).toBe(false);
  });

  it("does not link to a retired admin-only login route", async () => {
    // There is one sign-in page for the whole application, so the navbar
    // must not point anywhere near the old dedicated admin login.
    const html = await render();

    expect(has(html, 'href="/app/admin/login"')).toBe(false);
    expect(has(html, 'href="/admin/login"')).toBe(false);
  });
});

describe("customer Navbar — suspended user", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-1",
        name: "Suspended Tester",
        email: "suspended@test.local",
        role: "customer",
        status: "suspended",
      },
    };
  });

  it("treats a suspended account as signed out", async () => {
    // The account is revoked at the next sign-in, but a session that is
    // already live must not keep rendering the signed-in Navbar.
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(true);
    expect(has(html, "Log out")).toBe(false);
  });
});

describe("customer Navbar — suspended admin account", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-admin",
        name: "Suspended Admin",
        email: "admin@freshtrace.com",
        role: "admin",
        status: "suspended",
      },
    };
  });

  it("does not show the Admin Dashboard link", async () => {
    // A suspended account is treated as signed out, so the admin link must
    // not survive the role check.
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(false);
    expect(has(html, "Admin Dashboard")).toBe(false);
  });
});

describe("customer Navbar — active subscription marker", () => {
  let subscriber;
  let plan;
  let address;

  beforeEach(async () => {
    subscriber = await prisma.user.create({
      data: {
        email: `navbar.subscriber.${Date.now()}@test.local`,
        passwordHash: "x",
        name: "Plan Subscriber",
        role: "customer",
      },
    });

    plan = await prisma.subscriptionPlan.findFirst({
      where: { isActive: true },
    });

    // The test database is migrated but not seeded, so there may be no plan
    // to subscribe to.
    if (!plan) {
      plan = await prisma.subscriptionPlan.create({
        data: {
          name: "Navbar Test Plan",
          basketSize: "small",
          weeklyPrice: 650,
          composition: "[]",
          isActive: true,
        },
      });
    }

    address = await prisma.address.create({
      data: {
        userId: subscriber.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    sessionState.session = {
      id: "session-1",
      user: {
        id: subscriber.id,
        name: subscriber.name,
        email: subscriber.email,
        role: "customer",
        status: "active",
      },
    };
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { customerId: subscriber.id } });
    await prisma.address.deleteMany({ where: { userId: subscriber.id } });
    await prisma.user.deleteMany({ where: { id: subscriber.id } });
  });

  it("marks the subscriptions link when the customer has an active plan", async () => {
    await prisma.subscription.create({
      data: {
        customerId: subscriber.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "active",
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const html = await render();

    expect(has(html, "You have an active subscription")).toBe(true);
  });

  it("does not mark the subscriptions link for a paused plan", async () => {
    await prisma.subscription.create({
      data: {
        customerId: subscriber.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "paused",
        pauseUntil: new Date(Date.now() + 7 * 86_400_000),
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const html = await render();

    expect(has(html, "You have an active subscription")).toBe(false);
  });
});
