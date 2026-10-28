import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

/**
 * Admin & QC operations access control.
 *
 * Story 5 adds an *internal* operations panel at `/app/admin/*`. It is not
 * part of the customer marketplace and is not exposed to aggregators or
 * qc_staff accounts through the customer shell.
 *
 * The panel uses a **dedicated admin session**, separate from the customer
 * `ft_session` cookie:
 *
 * - A customer who signs in with the normal login form cannot reach
 *   `/app/admin/*`, even if their `User.role` happens to be `admin`. The
 *   admin panel is gated on its own cookie.
 * - The admin cookie is httpOnly and its token is stored server-side as a
 *   SHA-256 hash, matching the customer session's discipline.
 *
 * There is a **single sign-in page** for the whole application. The
 * operations credential is checked by the same route that handles customer
 * sign-in (`POST /api/auth/login`), which opens the admin session instead of
 * a customer session when the credential matches.
 *
 * The credentials are **fixed** by the story: `admin@freshtrace.com` /
 * `AdminPassword123!`, overridable through the `ADMIN_EMAIL` and
 * `ADMIN_PASSWORD` environment variables so a deployment can rotate them
 * without a code change.
 *
 * This is a deliberate v1 trade-off — the panel is internal, single-tenant
 * and operated by the FreshTrace team, so a single fixed operator account is
 * the whole requirement. The credential is verified in constant time and the
 * comparison does not leak *which* part was wrong.
 */

/** Cookie name for the dedicated admin session. */
export const ADMIN_SESSION_COOKIE_NAME = "ft_admin_session";

/** Admin session lifetime in hours. Shorter than the customer session. */
export const ADMIN_SESSION_MAX_AGE_HOURS = 12;

const MS_PER_HOUR = 3_600_000;

/**
 * The default admin email, used when `ADMIN_EMAIL` is unset.
 *
 * @type {string}
 */
export const DEFAULT_ADMIN_EMAIL = "admin@freshtrace.com";

/**
 * The default admin password, used when `ADMIN_PASSWORD` is unset.
 *
 * @type {string}
 */
export const DEFAULT_ADMIN_PASSWORD = "AdminPassword123!";

/**
 * The configured admin email.
 *
 * @returns {string}
 */
export function getAdminEmail() {
  const configured = process.env.ADMIN_EMAIL;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured.trim().toLowerCase();
  }
  return DEFAULT_ADMIN_EMAIL;
}

/**
 * The configured admin password.
 *
 * @returns {string}
 */
export function getAdminPassword() {
  const configured = process.env.ADMIN_PASSWORD;
  if (typeof configured === "string" && configured !== "") {
    return configured;
  }
  return DEFAULT_ADMIN_PASSWORD;
}

/**
 * Hash an admin session token for storage.
 *
 * The token never touches the database in plaintext, so a database leak does
 * not hand an attacker a usable admin session.
 *
 * @param {string} token
 * @returns {string}
 */
export function hashAdminToken(token) {
  const secret = process.env.SESSION_SECRET || "";
  return createHash("sha256").update(`admin:${secret}:${token}`).digest("hex");
}

/**
 * Generate a fresh opaque admin session token.
 *
 * @returns {string}
 */
export function generateAdminToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Compare two strings in constant time.
 *
 * `timingSafeEqual` throws when the two buffers have different lengths, so
 * the lengths are compared first — the length of an email or a password is
 * not the secret being protected.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify admin credentials.
 *
 * Returns `false` for *any* failure — unknown email, wrong password — so a
 * caller cannot distinguish which part was wrong. That also stops the login
 * form being used to enumerate valid accounts.
 *
 * @param {string | null | undefined} email
 * @param {string | null | undefined} password
 * @returns {boolean}
 */
export function verifyAdminCredentials(email, password) {
  if (typeof email !== "string" || typeof password !== "string") return false;
  if (email === "" || password === "") return false;

  const emailOk = safeEqual(email.trim().toLowerCase(), getAdminEmail());
  const passwordOk = safeEqual(password, getAdminPassword());

  // Both are always computed — a short-circuit on `emailOk` would make the
  // response time reveal whether the email was right.
  return emailOk && passwordOk;
}

/**
 * Ensure the fixed operator exists as a `User` row.
 *
 * The operations panel is gated on a fixed credential rather than a person
 * in the customer directory, but several operational records still need an
 * author: a `BatchQcLog` records *who* inspected a batch, and a `Refund`
 * records *who* resolved it. Both reference `User`.
 *
 * So the fixed operator is materialised as a real `User` row with the
 * `admin` role, created on first sign-in if it is not already there. The
 * password hash is unusable — the operator never authenticates through the
 * customer directory, only through the fixed admin credential.
 *
 * @returns {Promise<import("@prisma/client").User>}
 */
export async function ensureAdminOperator() {
  const email = getAdminEmail();

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Keep the role and status correct if the row predates a role change.
    if (existing.role !== "admin" || existing.status !== "active") {
      return prisma.user.update({
        where: { id: existing.id },
        data: { role: "admin", status: "active" },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      // A hash of a random value that is never shown to anyone: the
      // operator authenticates with the fixed admin credential, not with
      // this password. The row exists to carry the audit trail.
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      name: "Operations",
      role: "admin",
      status: "active",
    },
  });
}

/**
 * Create an admin session and return the raw token.
 *
 * Admin sessions live in their own `AdminSession` table. They are *not*
 * stored in the customer `Session` table, because that table's `userId` is
 * a foreign key to `User` and the panel deliberately keeps its session
 * state separate from the storefront's.
 *
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createAdminSession() {
  const operator = await ensureAdminOperator();

  const token = generateAdminToken();
  const tokenHash = hashAdminToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_HOURS * MS_PER_HOUR);

  await prisma.adminSession.create({
    data: {
      operatorId: operator.id,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * Look up a valid admin session by its raw token.
 *
 * Expired sessions are deleted on sight, so a stale cookie cannot be used.
 *
 * @param {string | undefined | null} token
 * @returns {Promise<import("@prisma/client").AdminSession | null>}
 */
export async function getAdminSessionByToken(token) {
  if (!token) return null;

  const tokenHash = hashAdminToken(token);

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { operator: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session;
}

/**
 * Delete an admin session (logout).
 *
 * @param {string | undefined | null} token
 * @returns {Promise<void>}
 */
export async function destroyAdminSession(token) {
  if (!token) return;

  await prisma.adminSession.deleteMany({
    where: { tokenHash: hashAdminToken(token) },
  });
}

/**
 * Read the current admin session from the request cookie.
 *
 * @returns {Promise<import("@prisma/client").AdminSession | null>}
 */
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  return getAdminSessionByToken(token);
}

/**
 * Build the `Set-Cookie` options for the admin session cookie.
 *
 * @param {number} maxAgeSeconds
 * @returns {import("next/dist/compiled/@edge-runtime/cookies").ResponseCookie}
 */
export function adminCookieOptions(maxAgeSeconds = ADMIN_SESSION_MAX_AGE_HOURS * 3600) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
