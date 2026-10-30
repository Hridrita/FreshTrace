import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * Page-level authentication guard for the customer shell.
 *
 * The catalogue is deliberately **public** — a shopper must be able to browse
 * produce, prices and batch details without creating an account. Everything
 * that belongs to a person (cart, checkout, orders, subscriptions, account)
 * is not.
 *
 * Every protected page used to spell its own redirect out by hand:
 *
 * ```js
 * redirect("/login?next=%2Fapp%2Fcart");
 * ```
 *
 * That is easy to get subtly wrong — a mistyped path sends the customer back
 * to the wrong place after signing in, and a page that forgets the guard
 * leaks a protected page to anonymous visitors. This module centralises the
 * rule so a route states *what it is* rather than *how to bounce*.
 *
 * @param {object} props
 * @param {string} props.path the path to return to after signing in
 * @returns {Promise<import("@prisma/client").User>}
 * @throws {never} redirects to `/login` when there is no usable session
 */
export async function requireCustomerSession(path) {
  const session = await getSession();
  const user = session?.user ?? null;

  // A suspended account's sessions are revoked when it next tries to sign in,
  // but a session that is already live would otherwise keep rendering the
  // signed-in chrome. Treat a suspended user as signed out — the same rule
  // the customer shell's header applies.
  if (!user || user.status === "suspended") {
    redirect(loginPathFor(path));
  }

  return user;
}

/**
 * Build the `/login` URL for a protected path.
 *
 * The target is encoded so it survives the query string intact, and the path
 * is validated on the way *in* as well: `safeRedirectPath` runs over it when
 * the login form reads it back, so a tampered `?next=` cannot push the
 * browser off-site.
 *
 * @param {string} path
 * @returns {string}
 */
export function loginPathFor(path) {
  return `/login?next=${encodeURIComponent(path)}`;
}
