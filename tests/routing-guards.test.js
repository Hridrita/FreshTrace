import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Routing guard tests.
 *
 * The app has two kinds of customer route:
 *
 * - **Public** — the landing page, the catalogue and a product's detail
 *   page. A visitor can browse produce, prices and batch information
 *   without an account.
 * - **Guarded** — the cart, checkout, orders, subscriptions and the account
 *   pages. These belong to a person, so a signed-out visitor is redirected
 *   to `/login` and returned to where they were headed afterwards.
 *
 * `requireCustomerSession` in `src/lib/auth/page-guard.js` is the single
 * place that rule lives. These tests cover the helper directly, so a route
 * cannot quietly regress to "guard removed" or "redirect to the wrong path".
 */

const sessionState = { session: null };

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(async () => sessionState.session),
  };
});

// `redirect()` throws a special error that Next.js catches to perform the
// navigation. The helper is called from a Server Component, so the mock has
// to reproduce that behaviour: throw a tagged error carrying the target.
const REDIRECT = "NEXT_REDIRECT";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    error.digest = `NEXT_REDIRECT;${path}`;
    throw error;
  }),
}));

const { requireCustomerSession, loginPathFor } = await import(
  "@/lib/auth/page-guard"
);

/**
 * Run the guard and report whether it redirected.
 *
 * @param {string} path
 * @returns {Promise<{ redirected: boolean, target?: string, user?: object }>}
 */
async function attempt(path) {
  try {
    const user = await requireCustomerSession(path);
    return { redirected: false, user };
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.+)$/.exec(String(error?.message ?? ""));
    if (match) return { redirected: true, target: match[1] };
    throw error;
  }
}

/**
 * A signed-in customer.
 */
function activeSession() {
  return {
    id: "session-1",
    user: {
      id: "user-1",
      name: "Test Customer",
      email: "customer@test.local",
      role: "customer",
      status: "active",
    },
  };
}

beforeEach(() => {
  sessionState.session = null;
});

describe("loginPathFor", () => {
  it("encodes the target path into the next parameter", () => {
    expect(loginPathFor("/app/cart")).toBe("/login?next=%2Fapp%2Fcart");
  });

  it("encodes a nested path", () => {
    expect(loginPathFor("/app/orders/abc123")).toBe(
      "/login?next=%2Fapp%2Forders%2Fabc123",
    );
  });

  it("encodes a path with a query string", () => {
    expect(loginPathFor("/app/products?category=fruit")).toBe(
      "/login?next=%2Fapp%2Fproducts%3Fcategory%3Dfruit",
    );
  });
});

describe("requireCustomerSession — signed out", () => {
  it("redirects to the login page", async () => {
    const result = await attempt("/app/cart");

    expect(result.redirected).toBe(true);
    expect(result.target).toContain("/login");
  });

  it("carries the original path so the customer returns to it", async () => {
    const result = await attempt("/app/orders");

    expect(result.target).toBe("/login?next=%2Fapp%2Forders");
  });

  it("redirects a suspended account as though it were signed out", async () => {
    // A suspended account's sessions are revoked when it next signs in, but
    // a live session would otherwise keep rendering the signed-in chrome.
    sessionState.session = {
      ...activeSession(),
      user: { ...activeSession().user, status: "suspended" },
    };

    const result = await attempt("/app/cart");

    expect(result.redirected).toBe(true);
    expect(result.target).toContain("/login");
  });
});

describe("requireCustomerSession — signed in", () => {
  beforeEach(() => {
    sessionState.session = activeSession();
  });

  it("returns the user without redirecting", async () => {
    const result = await attempt("/app/cart");

    expect(result.redirected).toBe(false);
    expect(result.user?.id).toBe("user-1");
  });

  it("works for every guarded route", async () => {
    const guarded = [
      "/app/cart",
      "/app/checkout",
      "/app/orders",
      "/app/orders/abc123",
      "/app/subscriptions",
      "/app/account",
      "/app/account/addresses",
    ];

    for (const path of guarded) {
      const result = await attempt(path);
      expect(result.redirected, `${path} should not redirect`).toBe(false);
    }
  });
});
