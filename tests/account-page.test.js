import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { prerender } from "react-dom/static";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Account page render tests.
 *
 * `src/app/(customer)/app/account/page.jsx` is a Server Component that brings
 * together the customer's details, addresses, subscription and recent
 * orders. These render it to HTML and assert on what a customer would
 * actually see.
 *
 * The session module is mocked so the page can be rendered with a chosen
 * session, and `react-dom/static`'s `prerender` turns the element tree into
 * markup.
 */

const sessionState = { session: null };

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(async () => sessionState.session),
  };
});

// The account page's client components call `useRouter()`, which needs a
// mounted App Router. The router is not under test here — only the page
// that decides what to render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { default: AccountPage } = await import("@/app/(customer)/app/account/page.jsx");
const { default: AccountAddressesPage } = await import(
  "@/app/(customer)/app/account/addresses/page.jsx"
);

let customer;
let otherCustomer;
let aggregator;
let plan;
let product;
let batch;

/**
 * Render the account page to HTML.
 *
 * @returns {Promise<string>}
 */
async function render() {
  const { prelude } = await prerender(createElement(AccountPage, null));

  const chunks = [];
  const decoder = new TextDecoder();

  for await (const chunk of prelude) {
    chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
  }

  return chunks.join("");
}

/**
 * Render the addresses sub-page to HTML.
 *
 * @returns {Promise<string>}
 */
async function renderAddresses() {
  const { prelude } = await prerender(
    createElement(AccountAddressesPage, null),
  );

  const chunks = [];
  const decoder = new TextDecoder();

  for await (const chunk of prelude) {
    chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
  }

  return chunks.join("");
}

/**
 * Strip React's text separators and HTML entities so plain substring
 * assertions work on server-rendered markup.
 *
 * @param {string} html
 * @returns {string}
 */
function strip(html) {
  return html
    .replace(/<!--\s*-->/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * @param {string} html
 * @param {string} needle
 * @returns {boolean}
 */
function has(html, needle) {
  return html.includes(needle);
}

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.account.page@test.local",
      passwordHash: "not-a-real-hash",
      name: "Account Page Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.account.page.other@test.local",
      passwordHash: "x",
      name: "Other Account Page Customer",
      role: "customer",
    },
  });

  // A batch belongs to an aggregator, and an order line belongs to a batch.
  aggregator = await prisma.user.create({
    data: {
      email: "agg.account.page@test.local",
      passwordHash: "x",
      name: "Account Page Aggregator",
      role: "aggregator",
      companyName: "Account Page Farms",
      districts: JSON.stringify(["Dhaka"]),
    },
  });

  product = await prisma.product.create({
    data: {
      sku: "FR-ACCOUNT-PAGE-MANGO",
      name: "Account Page Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 200,
      harvestToShelfDays: 7,
      isActive: true,
    },
  });

  batch = await prisma.batch.create({
    data: {
      productId: product.id,
      aggregatorId: aggregator.id,
      batchCode: "FT-ACCT-PAGE-2026-10-09-1",
      qrSlug: "account-page-slug-1",
      harvestDate: new Date(),
      originDistrict: "Dhaka",
      inboundQty: 10,
      availableQty: 10,
      status: "listed",
      qcStatus: "passed",
      currentTier: "fresh",
      currentPriceMultiplier: 1.0,
    },
  });

  plan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true } });

  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: "Account Page Plan",
        basketSize: "small",
        weeklyPrice: 650,
        composition: "[]",
        isActive: true,
      },
    });
  }
});

afterAll(async () => {
  // Order lines reference the batch, so the orders go first.
  await prisma.order.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.batch.deleteMany({ where: { id: batch.id } });
  await prisma.product.deleteMany({ where: { id: product.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [customer.id, otherCustomer.id, aggregator.id] } },
  });
});

beforeEach(async () => {
  await prisma.order.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.subscription.deleteMany({
    where: { customerId: { in: [customer.id, otherCustomer.id] } },
  });
  await prisma.address.deleteMany({
    where: { userId: { in: [customer.id, otherCustomer.id] } },
  });

  sessionState.session = {
    id: "session-1",
    user: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      role: "customer",
      status: "active",
    },
  };
});

describe("account page — details", () => {
  it("shows the customer's name and email", async () => {
    const html = strip(await render());

    expect(has(html, "Account Page Customer")).toBe(true);
    expect(has(html, "customer.account.page@test.local")).toBe(true);
  });

  it("shows the details, address, subscription and orders sections", async () => {
    const html = strip(await render());

    expect(has(html, "Your details")).toBe(true);
    expect(has(html, "Delivery addresses")).toBe(true);
    expect(has(html, "Your subscription")).toBe(true);
    expect(has(html, "Recent orders")).toBe(true);
  });

  it("makes the email read-only", async () => {
    const html = strip(await render());

    // React renders the `readOnly` prop as `readOnly=""`.
    expect(has(html, 'readOnly=""')).toBe(true);
    expect(
      has(html, "Your email identifies your account and cannot be changed here."),
    ).toBe(true);
  });

  it("never renders the password hash", async () => {
    const html = strip(await render());

    expect(has(html, customer.passwordHash)).toBe(false);
  });

  it("uses the glass card treatment", async () => {
    const html = await render();

    expect(has(html, "backdrop-blur-md")).toBe(true);
    expect(has(html, "border-white/40")).toBe(true);
  });
});

describe("account page — addresses", () => {
  it("lists the customer's addresses", async () => {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const html = strip(await render());

    expect(has(html, "House 10, Road 5")).toBe(true);
    expect(has(html, "Gulshan-2")).toBe(true);
    expect(has(html, "Default")).toBe(true);
  });

  it("never lists another customer's address", async () => {
    await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const html = strip(await render());

    expect(has(html, "House 99, Road 9")).toBe(false);
    expect(has(html, "Other Home")).toBe(false);
  });

  it("shows the empty state when there are no addresses", async () => {
    const html = strip(await render());

    expect(has(html, "No delivery address yet")).toBe(true);
  });
});

describe("account page — subscription", () => {
  it("shows the empty state when there is no subscription", async () => {
    const html = strip(await render());

    expect(has(html, "No subscription yet")).toBe(true);
    expect(has(html, "Choose a weekly basket")).toBe(true);
  });

  it("shows the plan, next delivery and delivery address", async () => {
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
        status: "active",
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const html = strip(await render());

    expect(has(html, "Next delivery")).toBe(true);
    expect(has(html, "Every Friday")).toBe(true);
    expect(has(html, "Delivering to")).toBe(true);
    expect(has(html, "House 10, Road 5")).toBe(true);
    expect(has(html, plan.name)).toBe(true);
    expect(has(html, "Manage subscription")).toBe(true);
  });

  it("shows the paused state instead of the next delivery", async () => {
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
        status: "paused",
        pauseUntil: new Date(Date.now() + 7 * 86_400_000),
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const html = strip(await render());

    expect(has(html, "Paused until")).toBe(true);
    expect(has(html, "no deliveries while paused")).toBe(true);
  });

  it("lists the items in the weekly basket", async () => {
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

    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        composition: JSON.stringify([{ productId: product.id, defaultQty: 2 }]),
      },
    });

    await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek: 5,
        status: "active",
        nextDeliveryAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const html = strip(await render());

    expect(has(html, "Items in your weekly basket")).toBe(true);
    expect(has(html, "Account Page Mango")).toBe(true);

    // Restore the plan's composition for the other tests.
    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { composition: "[]" },
    });
  });
});

describe("account page — addresses sub-page", () => {
  it("renders the addresses on their own page", async () => {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: "House 10, Road 5",
        area: "Gulshan-2",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const html = strip(await renderAddresses());

    expect(has(html, "Delivery addresses")).toBe(true);
    expect(has(html, "House 10, Road 5")).toBe(true);
    expect(has(html, "Gulshan-2")).toBe(true);
    expect(has(html, 'href="/app/account"')).toBe(true);
  });

  it("links to the sub-page from the account page", async () => {
    const html = strip(await render());

    expect(has(html, 'href="/app/account/addresses"')).toBe(true);
  });

  it("never lists another customer's address", async () => {
    await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Other Home",
        line1: "House 99, Road 9",
        area: "Banani",
        city: "Dhaka",
        isDefault: true,
      },
    });

    const html = strip(await renderAddresses());

    expect(has(html, "House 99, Road 9")).toBe(false);
  });
});

describe("account page — orders", () => {
  it("shows the empty state when there are no orders", async () => {
    const html = strip(await render());

    expect(has(html, "You have not ordered anything yet")).toBe(true);
    expect(has(html, "View all orders")).toBe(true);
  });

  it("lists a recent order and links to it", async () => {
    const order = await prisma.order.create({
      data: {
        orderCode: "FT-ORD-ACCOUNT-TEST-0001",
        customerId: customer.id,
        addressSnapshot: "{}",
        subtotal: 500,
        deliveryFee: 60,
        grandTotal: 560,
        status: "paid",
        paymentStatus: "paid",
        items: {
          create: {
            batchId: batch.id,
            name: "Account Page Mango",
            qty: 1,
            unitPrice: 500,
            lineTotal: 500,
            freshnessTierAtOrder: "fresh",
          },
        },
      },
    });

    const html = strip(await render());

    expect(has(html, "FT-ORD-ACCOUNT-TEST-0001")).toBe(true);
    expect(has(html, `href="/app/orders/${order.id}"`)).toBe(true);
    expect(has(html, "1 item")).toBe(true);
    expect(has(html, "You have not ordered anything yet")).toBe(false);
  });

  it("never lists another customer's order", async () => {
    await prisma.order.create({
      data: {
        orderCode: "FT-ORD-ACCOUNT-OTHER-0001",
        customerId: otherCustomer.id,
        addressSnapshot: "{}",
        subtotal: 300,
        deliveryFee: 60,
        grandTotal: 360,
        status: "paid",
        paymentStatus: "paid",
        items: {
          create: {
            batchId: batch.id,
            name: "Account Page Mango",
            qty: 1,
            unitPrice: 300,
            lineTotal: 300,
            freshnessTierAtOrder: "fresh",
          },
        },
      },
    });

    const html = strip(await render());

    expect(has(html, "FT-ORD-ACCOUNT-OTHER-0001")).toBe(false);
  });
});
