import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADMIN_SESSION_COOKIE_NAME,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  adminCookieOptions,
  getAdminEmail,
  getAdminPassword,
  hashAdminToken,
  verifyAdminCredentials,
} from "@/lib/admin/auth";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/guard";

/**
 * Admin access control.
 *
 * The operations credential is `admin@freshtrace.com` with the default
 * password, overridable through `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
 *
 * The default password is the same one `prisma/seed.js` writes for the
 * seeded operator, so a freshly seeded database can be signed into with no
 * environment configuration and lands on the operations panel.
 */

describe("admin credential configuration", () => {
  const originalEmail = process.env.ADMIN_EMAIL;
  const originalPassword = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalEmail;

    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  });

  it("falls back to the documented fixed credential", () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    expect(getAdminEmail()).toBe(DEFAULT_ADMIN_EMAIL);
    expect(getAdminEmail()).toBe("admin@freshtrace.com");
    expect(getAdminPassword()).toBe(DEFAULT_ADMIN_PASSWORD);
  });

  it("uses the same default password the seed writes", () => {
    // The seed and the panel must agree, or a seeded operator cannot sign
    // in to the dashboard at all.
    delete process.env.ADMIN_PASSWORD;

    const seed = readFileSync(
      new URL("../prisma/seed.js", import.meta.url),
      "utf8",
    );

    expect(seed).toContain(`"${DEFAULT_ADMIN_PASSWORD}"`);
  });

  it("prefers the environment variables when they are set", () => {
    process.env.ADMIN_EMAIL = "ops@freshtrace.com";
    process.env.ADMIN_PASSWORD = "Rotated-Pass-2026!";

    expect(getAdminEmail()).toBe("ops@freshtrace.com");
    expect(getAdminPassword()).toBe("Rotated-Pass-2026!");
  });

  it("treats an empty environment variable as unset", () => {
    process.env.ADMIN_EMAIL = "   ";
    process.env.ADMIN_PASSWORD = "";

    expect(getAdminEmail()).toBe(DEFAULT_ADMIN_EMAIL);
    expect(getAdminPassword()).toBe(DEFAULT_ADMIN_PASSWORD);
  });
});

describe("verifyAdminCredentials", () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it("accepts the fixed credential", () => {
    expect(
      verifyAdminCredentials("admin@freshtrace.com", DEFAULT_ADMIN_PASSWORD),
    ).toBe(true);
  });

  it("is case-insensitive on the email and trims whitespace", () => {
    expect(
      verifyAdminCredentials("  ADMIN@FreshTrace.com  ", DEFAULT_ADMIN_PASSWORD),
    ).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyAdminCredentials("admin@freshtrace.com", "wrong-password")).toBe(false);
  });

  it("rejects an unknown email", () => {
    expect(
      verifyAdminCredentials("someone@example.com", DEFAULT_ADMIN_PASSWORD),
    ).toBe(false);
  });

  it("rejects empty and missing values", () => {
    expect(verifyAdminCredentials("", DEFAULT_ADMIN_PASSWORD)).toBe(false);
    expect(verifyAdminCredentials("admin@freshtrace.com", "")).toBe(false);
    expect(verifyAdminCredentials(undefined, undefined)).toBe(false);
    expect(verifyAdminCredentials(null, null)).toBe(false);
  });

  it("rejects a non-string password without throwing", () => {
    expect(verifyAdminCredentials("admin@freshtrace.com", 12345)).toBe(false);
  });
});

describe("admin session token", () => {
  it("hashes a token deterministically", () => {
    const hash = hashAdminToken("some-token");

    expect(hash).toBe(hashAdminToken("some-token"));
    expect(hash).not.toBe(hashAdminToken("other-token"));
  });

  it("produces a 64-character hex digest", () => {
    expect(hashAdminToken("some-token")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not collide with a customer session hash", async () => {
    const { hashSessionToken } = await import("@/lib/auth/session");

    // The admin hash is namespaced, so a customer token that happens to be
    // the same string must not produce the same stored hash.
    expect(hashAdminToken("shared-token")).not.toBe(hashSessionToken("shared-token"));
  });
});

describe("admin cookie options", () => {
  it("is httpOnly, same-site lax and path-scoped to the whole app", () => {
    const options = adminCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("uses a dedicated cookie name, separate from the customer session", () => {
    expect(ADMIN_SESSION_COOKIE_NAME).toBe("ft_admin_session");
    expect(ADMIN_SESSION_COOKIE_NAME).not.toBe("ft_session");
  });
});

describe("admin route guard", () => {
  it("sends an unauthenticated visitor to the unified login page", () => {
    // There is one sign-in page for the whole application. The guard's
    // redirect target is that page — the main navbar's "Admin Dashboard"
    // link points at `/app/admin`, so an unauthenticated click has to land
    // there.
    expect(ADMIN_LOGIN_PATH).toBe("/login");
  });

  it("keeps the login path outside the guarded admin subtree", () => {
    // The login page must be reachable *without* a session, so it cannot
    // live under the guard that would redirect it to itself, forever.
    expect(ADMIN_LOGIN_PATH.startsWith("/app/admin")).toBe(false);
  });

  it("does not point at a retired admin-only login route", () => {
    // The separate `/app/admin/login` page has been removed, so nothing
    // should redirect there any more.
    expect(ADMIN_LOGIN_PATH).not.toBe("/app/admin/login");
    expect(ADMIN_LOGIN_PATH).not.toBe("/admin/login");
  });
});
