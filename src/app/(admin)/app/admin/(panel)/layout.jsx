import Link from "next/link";
import { Leaf } from "lucide-react";
import AdminNav, { AdminLogoutButton } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/lib/admin/guard";

/**
 * Admin & QC operations shell.
 *
 * Story 5 places the internal operations panel at `/app/admin/*`. The shell
 * is a soft canvas with a frosted header and a pill navigation, which is
 * deliberately a different visual register from the customer storefront —
 * the operator can tell at a glance which surface they are on. It shares
 * the storefront's green brand accent, so the panel reads as part of the
 * same product.
 *
 * The **guard lives here**, not in each page. Because the whole
 * `/app/admin/*` subtree is nested under this layout, every page beneath it
 * is protected even if a new page forgets to check. The check is
 * server-side, so an unauthenticated request is redirected before any
 * operational data is streamed to the browser.
 *
 * The sign-in page is *outside* this shell — it is the application's single
 * `/login` page, in the `(auth)` route group. A layout cannot both guard its
 * children and let one of them render unauthenticated, so the sign-in page
 * must not sit beneath this one.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: {
    default: "Operations — FreshTrace",
    template: "%s — FreshTrace Operations",
  },
  description: "Internal admin and QC operations dashboard for FreshTrace.",
};

export default async function AdminLayout({ children }) {
  // Redirects to the login page when there is no valid admin session.
  await requireAdminPage("/app/admin");

  return (
    // `overflow-x-clip` rather than `overflow-x-hidden`: `hidden` makes this
    // element a scroll container, which silently swallows the horizontal
    // scroll of every nested `overflow-x-auto` (the data tables and the pill
    // navigation). `clip` trims the overflowing ambient washes without
    // creating a scroll container, so the tables still scroll sideways.
    <div className="relative min-h-screen overflow-x-clip bg-sand-50">
      {/* ── Ambient wash ──────────────────────────────────────────────
          A soft green gradient behind the frosted surfaces, so the
          `backdrop-blur` has colour to diffuse. Decorative only. */}
      <div
        className="pointer-events-none absolute -left-32 -top-32 size-[26rem] rounded-full bg-brand-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 top-1/3 size-[22rem] rounded-full bg-brand-100/50 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-sand-50/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Link
                href="/app/admin"
                className="flex items-center gap-2.5 font-semibold tracking-tight text-sand-900"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
                  <Leaf className="size-4.5" aria-hidden="true" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[15px]">FreshTrace</span>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-sand-500">
                    Operations
                  </span>
                </span>
              </Link>

              <div className="ml-auto flex items-center gap-2.5">
                <span className="hidden items-center gap-1.5 rounded-full border border-brand-300/50 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800 md:inline-flex">
                  Internal admin &amp; QC panel
                </span>
                <AdminLogoutButton />
              </div>
            </div>

            {/* ── Pill navigation ─────────────────────────────────────── */}
            <div className="-mx-1 overflow-x-auto pb-0.5">
              <AdminNav />
            </div>
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────────── */}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
