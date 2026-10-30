"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Repeat,
  Settings,
  ShoppingBasket,
} from "lucide-react";

/**
 * Admin pill navigation.
 *
 * The navigation is a row of pill-shaped tabs under the brand. The active
 * tab is filled with the brand green accent; the inactive ones are
 * translucent, so the row reads as a single segmented control rather than a
 * list of links.
 *
 * The active state is derived from the pathname, so it stays correct on a
 * hard refresh and on every nested route without the server having to pass
 * an `activeKey` prop down.
 */
const NAV_ITEMS = [
  { href: "/app/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/admin/batches", label: "Batches / QC", icon: ClipboardCheck },
  { href: "/app/admin/orders", label: "Orders", icon: ShoppingBasket },
  { href: "/app/admin/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/app/admin/settings", label: "Settings", icon: Settings },
];

/**
 * Is this nav item the active one for the current pathname?
 *
 * `/app/admin` is only active on itself — otherwise the Dashboard tab would
 * stay lit while the operator is in a sub-page.
 *
 * @param {{ href: string, exact?: boolean }} item
 * @param {string} pathname
 * @returns {boolean}
 */
function isActive(item, pathname) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminNav() {
  const pathname = usePathname() ?? "/app/admin";

  return (
    <nav
      className="flex w-full items-center gap-1 overflow-x-auto rounded-full border border-white/60 bg-white/60 p-1 shadow-soft backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Operations sections"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-500 text-white shadow-soft"
                : "text-sand-600 hover:bg-white/80 hover:text-sand-900"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {/* The label is hidden below `sm`, where the tab is icon-only.
                It stays in the accessibility tree as screen-reader-only
                text, so the tab is never announced as an unlabelled
                button. */}
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sr-only sm:hidden">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The admin sign-out control.
 *
 * A separate endpoint from the customer logout — the admin cookie and the
 * customer cookie are independent. The admin session is destroyed, then the
 * operator is sent to the unified sign-in page.
 */
export function AdminLogoutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3.5 py-2 text-sm font-medium text-sand-600 shadow-soft backdrop-blur-md transition hover:bg-white/90 hover:text-sand-900"
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
