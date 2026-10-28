import Link from "next/link";
import { Leaf, LayoutDashboard, ShoppingBasket, User } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getCartCount } from "@/lib/cart";
import { hasActiveSubscription } from "@/lib/subscriptions-read";
import LogoutButton from "@/components/LogoutButton";

/**
 * Customer shell layout.
 *
 * SRS §9.1 places the customer shell at `(customer)/layout.jsx` and
 * SRS §9.2 notes the route group is protected by a layout-level guard that
 * checks the session and role server-side.
 *
 * The auth **guard** is intentionally not wired up: the catalogue is browsable
 * without an account, and a guard would lock every visitor out. The header is
 * session-*aware* though — it shows Login / Register when signed out and the
 * user's name plus a Log out control when signed in.
 *
 * The session is resolved **server-side** with `getSession()` — it reads the
 * `next/headers` cookie store, which is unavailable in a Client Component.
 * The result is passed down as props; only the Logout button needs
 * `"use client"`.
 */
export default async function CustomerLayout({ children }) {
  const session = await getSession();

  // A suspended account's sessions are revoked when it next tries to sign in,
  // but a session that is already live would otherwise keep rendering the
  // signed-in Navbar. Treat a suspended user as signed out.
  const user = session?.user && session.user.status !== "suspended" ? session.user : null;

  // The cart badge counts the lines in the customer's basket. A signed-out
  // visitor has no cart, so the counter is hidden. The count is read-only —
  // rendering a page must not create a cart row.
  const cartCount = await getCartCount(user?.id);

  // The Subscriptions link is marked with a dot when the customer has a
  // live plan, so the recurring delivery is visible from any page. Only
  // an `active` plan counts — a paused one is not delivering anything.
  const hasActivePlan = await hasActiveSubscription(user?.id);

  // The Admin Dashboard link is shown only to accounts with the `admin`
  // role. The operations panel is gated on its own dedicated admin session
  // (the `ft_admin_session` cookie), so a signed-in customer *without* that
  // cookie would still be bounced to the sign-in page. Hiding the link from
  // non-operators keeps the storefront honest about who can use the panel,
  // while the panel's own guard remains the real enforcement.
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/app/products"
            className="flex items-center gap-2 font-semibold tracking-tight text-sand-900"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Leaf className="size-4" aria-hidden="true" />
            </span>
            <span className="text-lg">FreshTrace</span>
          </Link>

          <nav
            className="hidden items-center gap-1 text-sm font-medium text-sand-600 md:flex"
            aria-label="Main"
          >
            <Link
              href="/app/products"
              className="rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
            >
              Catalogue
            </Link>

            {user ? (
              <>
                <Link
                  href="/app/orders"
                  className="rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
                >
                  Orders
                </Link>

                {/* The Subscriptions link carries a dot when the customer
                    has a live plan, so the recurring delivery is visible
                    from any page without opening the page itself. */}
                <Link
                  href="/app/subscriptions"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
                >
                  Subscriptions
                  {hasActivePlan ? (
                    <span
                      className="size-1.5 rounded-full bg-fresh-500"
                      title="You have an active subscription"
                      aria-label="You have an active subscription"
                      role="img"
                    />
                  ) : null}
                </Link>

                {/* The Admin Dashboard link is for FreshTrace staff only. The
                    link is rendered server-side, gated on the account role,
                    so a non-operator never sees it in the markup. Clicking
                    it while signed out of the panel still lands on the admin
                    sign-in page — the panel's own guard handles that. */}
                {isAdmin ? (
                  <Link
                    href="/app/admin"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    Admin Dashboard
                  </Link>
                ) : null}
              </>
            ) : null}

            {/* ── Not-yet-built destinations ───────────────────────────
                These pages belong to later stories. They are rendered as
                non-interactive spans rather than links: a disabled-looking
                `<a href>` still lets keyboard and screen-reader users
                activate a 404. */}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {user ? (
              <Link
                href="/app/cart"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
              >
                <span className="relative">
                  <ShoppingBasket className="size-4" aria-hidden="true" />
                  {cartCount > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">
                      {cartCount}
                    </span>
                  ) : null}
                </span>
                <span className="hidden sm:inline">Cart</span>
              </Link>
            ) : null}

            <Link
              href="/app/account"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
            >
              <User className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Account</span>
            </Link>

            {/* ── SessionUser slot ─────────────────────────────────────
                Signed out: Login + Register. Signed in: the user's name
                and a Log out control. */}
            {user ? (
              <div className="ml-1 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-700">
                  <span className="flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {initials(user.name, user.email)}
                  </span>
                  <span className="max-w-[10rem] truncate">{user.name ?? user.email}</span>
                </span>
                <LogoutButton />
              </div>
            ) : (
              <div className="ml-1 flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-sand-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-sand-500 sm:flex-row sm:px-6 lg:px-8">
          <p>
            FreshTrace — farm-to-table produce with visible freshness, delivered
            in Dhaka.
          </p>
          <p>Every batch is traceable back to its harvest.</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Two-letter initials for the signed-in user's avatar.
 *
 * Falls back to the email's first character when the account has no name.
 *
 * @param {string | null | undefined} name
 * @param {string} email
 * @returns {string}
 */
function initials(name, email) {
  const source = (name ?? "").trim();

  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((part) => part[0]);
    if (letters.length > 0) return letters.join("").toUpperCase();
  }

  return (email ?? "?").trim().charAt(0).toUpperCase() || "?";
}
