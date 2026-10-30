import { describe, it, expect, vi, beforeEach } from "vitest";
import { prerender } from "react-dom/static";
import { createElement } from "react";

/**
 * Landing-page navbar tests.
 *
 * The landing page lives outside the customer shell, so it has its own
 * header — but it must still react to the session. A visitor who is already
 * signed in should see their account destinations, not a "Sign in" button
 * that would take them somewhere they already are.
 *
 * The session module is mocked so the header can be rendered with a chosen
 * session, and `react-dom/static`'s `prerender` turns the element tree into
 * the HTML a visitor would actually receive.
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
// a mounted App Router. The router is not under test here — only the header
// that decides whether to render it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { default: MarketingNav } = await import(
  "@/components/marketing/MarketingNav"
);

/**
 * Render the marketing header to HTML.
 *
 * @returns {Promise<string>}
 */
async function render() {
  const { prelude } = await prerender(createElement(MarketingNav, null));

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

describe("landing Navbar — signed out", () => {
  it("offers Sign in and Get started", async () => {
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(true);
    expect(has(html, 'href="/register"')).toBe(true);
    expect(has(html, "Get started")).toBe(true);
  });

  it("shows the public section anchors", async () => {
    const html = await render();

    expect(has(html, 'href="#features"')).toBe(true);
    expect(has(html, 'href="#how-it-works"')).toBe(true);
    expect(has(html, 'href="#trust"')).toBe(true);
  });

  it("does not show account destinations", async () => {
    const html = await render();

    expect(has(html, 'href="/app/account"')).toBe(false);
    expect(has(html, 'href="/app/cart"')).toBe(false);
    expect(has(html, 'href="/app/orders"')).toBe(false);
  });

  it("does not show a Log out control", async () => {
    expect(has(await render(), "Log out")).toBe(false);
  });

  it("keeps the catalogue reachable", async () => {
    // The catalogue is public, so a signed-out visitor can browse it
    // without an account.
    const html = await render();

    expect(has(html, 'href="/app/products"')).toBe(true);
  });
});

describe("landing Navbar — signed in", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-1",
        name: "Test Customer",
        email: "customer@test.local",
        role: "customer",
        status: "active",
      },
    };
  });

  it("shows the signed-in destinations", async () => {
    const html = await render();

    expect(has(html, 'href="/app/products"')).toBe(true);
    expect(has(html, 'href="/app/orders"')).toBe(true);
    expect(has(html, 'href="/app/subscriptions"')).toBe(true);
    expect(has(html, 'href="/app/cart"')).toBe(true);
    expect(has(html, 'href="/app/account"')).toBe(true);
  });

  it("shows the user's name and a Log out control", async () => {
    const html = await render();

    expect(has(html, "Test Customer")).toBe(true);
    expect(has(html, "Log out")).toBe(true);
  });

  it("replaces Sign in and Get started", async () => {
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(false);
    expect(has(html, 'href="/register"')).toBe(false);
  });

  it("keeps the public section anchors", async () => {
    const html = await render();

    expect(has(html, 'href="#features"')).toBe(true);
    expect(has(html, 'href="#how-it-works"')).toBe(true);
    expect(has(html, 'href="#trust"')).toBe(true);
  });

  it("does not show the Admin link to a non-admin customer", async () => {
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(false);
  });
});

describe("landing Navbar — admin account", () => {
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

  it("shows the Admin link", async () => {
    const html = await render();

    expect(has(html, 'href="/app/admin"')).toBe(true);
  });
});
