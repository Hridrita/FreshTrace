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
        {/*
          Two rows on a phone, one row from `md` up. The brand and the
          account controls sit on the first row; the navigation gets its
          own row on a phone because there is no room for it beside the
          brand at 320 px.
        */}
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6 md:h-16 md:flex-row md:items-center md:gap-6 md:py-0 lg:px-8">
          <div className="flex items-center gap-3">
            {/* The brand mark goes home — the marketing landing page at
                `/` — rather than straight into the catalogue. */}
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-sand-900"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Leaf className="size-4" aria-hidden="true" />
              </span>
              <span className="text-lg">FreshTrace</span>
            </Link>

            {/* The signed-in user's name is the first thing that can be
                dropped on a narrow screen — the avatar still identifies
                them, and the name comes back from `sm` up. */}
            {user ? (
              <span className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-sand-700 md:hidden">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials(user.name, user.email)}
                </span>
              </span>
            ) : null}
          </div>

          {/*
            The navigation is a horizontally scrollable strip on a phone
            and an inline row from `md` up. Hiding it entirely below `md`
            would leave Orders and Subscriptions unreachable on a phone.
          */}
          <nav
            className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-0.5 text-sm font-medium text-sand-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0 md:pb-0"
            aria-label="Main"
          >
            {/* ── Home ───────────────────────────────────────────────
                The marketing landing page. It is public, so it is
                available whether or not anybody is signed in. */}
            <Link
              href="/"
              className="shrink-0 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
            >
              Home
            </Link>

            {/* ── Catalogue ──────────────────────────────────────────
                The catalogue is deliberately public: a shopper can browse
                produce, prices and batch details without an account. */}
            <Link
              href="/app/products"
              className="shrink-0 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
            >
              Catalogue
            </Link>

            {user ? (
              <>
                <Link
                  href="/app/orders"
                  className="shrink-0 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
                >
                  Orders
                </Link>

                {/* The Subscriptions link carries a dot when the customer
                    has a live plan, so the recurring delivery is visible
                    from any page without opening the page itself. */}
                <Link
                  href="/app/subscriptions"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
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
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 transition hover:bg-sand-100 hover:text-sand-900"
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

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* ── Signed-in actions ─────────────────────────────────────
                Cart, Account and the profile/logout control all belong to
                an account. A signed-out visitor gets none of them — the
                links would only bounce off the guard in the page they
                point at, which is a worse experience than not offering
                them at all. */}
            {user ? (
              <>
                <Link
                  href="/app/cart"
                  className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 sm:px-3"
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

                <Link
                  href="/app/account"
                  className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 sm:px-3"
                >
                  <User className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Account</span>
                </Link>

                {/* ── Profile slot ─────────────────────────────────────
                    The user's initials, their name and a Log out control. */}
                <div className="ml-1 flex items-center gap-1.5">
                  <span className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-700 md:inline-flex">
                    <span className="flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {initials(user.name, user.email)}
                    </span>
                    <span className="max-w-[10rem] truncate">
                      {user.name ?? user.email}
                    </span>
                  </span>
                  <LogoutButton />
                </div>
              </>
            ) : (
              /* ── Signed-out actions ───────────────────────────────────
                  Only public destinations. "Sign in" leads to the login
                  page and "Register" to sign-up; both carry the landing
                  page as their home. */
              <div className="ml-1 flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 sm:px-3"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 sm:px-3.5"
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
