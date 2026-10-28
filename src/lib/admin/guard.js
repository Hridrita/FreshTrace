import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";

/**
 * Admin route guard.
 *
 * Every page under `/app/admin/*` calls `requireAdminPage()` before it
 * renders. The check is **server-side** — the session is read from the
 * httpOnly cookie in a Server Component, so the redirect happens before any
 * markup is streamed and the protected data is never sent to an
 * unauthenticated browser.
 *
 * A client-side guard would not be sufficient on its own: the page's data
 * would already have been fetched. The layout also runs this check, so the
 * whole `/app/admin/*` subtree is protected even if a new page forgets to.
 */

/**
 * Where an unauthenticated admin visitor is sent.
 *
 * There is a single sign-in page for the whole application. The operations
 * credential is checked by the same route that handles customer sign-in, so
 * an operator who lands here signs in once and is forwarded to the panel.
 */
export const ADMIN_LOGIN_PATH = "/login";

/**
 * Require a valid admin session, or redirect to the login page.
 *
 * @param {string} [next] the path to return to after a successful login
 * @returns {Promise<import("@prisma/client").Session>}
 */
export async function requireAdminPage(next) {
  const session = await getAdminSession();

  if (!session) {
    const target = next
      ? `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(next)}`
      : ADMIN_LOGIN_PATH;
    redirect(target);
  }

  return session;
}

/**
 * Check for a valid admin session without redirecting.
 *
 * @returns {Promise<boolean>}
 */
export async function hasAdminSession() {
  const session = await getAdminSession();
  return Boolean(session);
}
