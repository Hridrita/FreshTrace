import Link from "next/link";
import { Leaf, LayoutDashboard, ShoppingBasket, User } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import LogoutButton from "@/components/LogoutButton";

/**
 * MarketingNav — the landing page's own header.
 *
 * The landing page lives *outside* the customer shell (`(customer)`), so it
 * cannot borrow that shell's header. But it still needs to react to the
 * session: a visitor who is already signed in should see their account
 * links, not a second "Sign in" button that would be a dead end.
 *
 * So this header resolves the session itself and swaps its action cluster
 * the same way the customer shell does:
 *
 * - **Signed out** — Sign in / Get started (Register).
 * - **Signed in** — Catalogue, Orders, Cart, Account, and the profile /
 *   logout control.
 *
 * The session is read **server-side** with `getSession()`: it reads the
 * `next/headers` cookie store, which is unavailable in a Client Component.
 * Only `LogoutButton` needs `"use client"`.
 *
 * ## Mobile navigation
 *
 * Below `md` the section links collapse into a horizontally scrollable
 * strip under the brand row rather than hiding behind a toggle button. That
 * keeps every section reachable at 320 px without needing a client
 * component — the whole landing page stays a Server Component.
 */
const SECTION_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#trust", label: "Trust" },
];

export default async function MarketingNav() {
  const session = await getSession();

  // A suspended account's sessions are revoked when it next tries to sign
  // in, but a live session would otherwise keep rendering the signed-in
  // chrome. Treat a suspended user as signed out — the same rule the
  // customer shell's header applies.
  const user = session?.user && session.user.status !== "suspended" ? session.user : null;

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* ── Brand ───────────────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-sand-900"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Leaf className="size-4" aria-hidden="true" />
          </span>
          <span className="text-lg">FreshTrace</span>
        </Link>

        {/* ── Section links (desktop) ─────────────────────────────────── */}
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Sections">
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        {user ? (
          <SignedInActions user={user} />
        ) : (
          <>
            {/* The catalogue is public, so a signed-out visitor can browse
                it. It is not in the section anchors because those jump
                within the landing page. */}
            <Link
              href="/app/products"
              className="ml-4 hidden shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 md:inline-block"
            >
              Catalogue
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
                Get started
              </Link>
            </div>
          </>
        )}
      </div>

      {/* ── Mobile section strip ────────────────────────────────────────
          A horizontally scrollable row of the section anchors. It keeps
          the sections reachable at 320 px without needing the menu, and
          it scrolls out of view rather than eating vertical space.

          The negative margin lives on the *wrapper*, not on the nav
          itself: the wrapper is clipped by `overflow-x-clip`, so the
          strip can bleed to the screen edge while the nav scrolls
          inside it. Putting `-mx-4` directly on the nav would make the
          nav 16 px wider than its parent and push the whole document
          sideways, because an `overflow-x-auto` element still
          contributes its own border-box width to the scroll width. */}
      <div className="overflow-x-clip md:hidden">
        <nav
          className="-mx-4 flex items-center gap-1 overflow-x-auto border-t border-sand-100 px-4 py-2 text-sm font-medium text-sand-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Page sections"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-lg px-3 py-1.5 transition hover:bg-sand-100 hover:text-sand-900"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

/**
 * The signed-in action cluster.
 *
 * It mirrors the customer shell's header: the same destinations, the same
 * icon treatment, and a profile slot with a log out control.
 *
 * @param {object} props
 * @param {import("@prisma/client").User} props.user
 */
function SignedInActions({ user }) {
  const isAdmin = user.role === "admin";

  return (
    <>
      {/* ── Authenticated routes ────────────────────────────────────────
          Hidden below `md`, where the section strip and the brand row
          take the full width. The customer shell's own header carries
          them on a phone, and the profile button below still offers the
          account. */}
      <nav
        className="ml-4 hidden items-center gap-1 md:flex"
        aria-label="Account"
      >
        <Link
          href="/app/products"
          className="rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
        >
          Catalogue
        </Link>

        <Link
          href="/app/orders"
          className="rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
        >
          Orders
        </Link>

        <Link
          href="/app/subscriptions"
          className="rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
        >
          Subscriptions
        </Link>

        {isAdmin ? (
          <Link
            href="/app/admin"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900"
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Link
          href="/app/cart"
          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 sm:px-3"
        >
          <ShoppingBasket className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Cart</span>
        </Link>

        <Link
          href="/app/account"
          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 sm:px-3"
        >
          <User className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Account</span>
        </Link>

        {/* ── Profile slot ─────────────────────────────────────────────── */}
        <div className="ml-1 flex items-center gap-1.5">
          <span className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-700 md:inline-flex">
            <span className="flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials(user.name, user.email)}
            </span>
            <span className="max-w-[10rem] truncate">{user.name ?? user.email}</span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </>
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
