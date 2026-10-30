import Link from "next/link";
import { Leaf, Mail, MapPin, Phone } from "lucide-react";

/**
 * Footer — the site-wide footer.
 *
 * It lives in the **root layout** (`src/app/layout.js`), not in the customer
 * shell, so it appears at the bottom of *every* route — the storefront, the
 * auth pages, the operations panel and the 404 boundary. That is the point of
 * a root-level footer: there is no page that can forget to include it.
 *
 * ## Responsive behaviour
 *
 * The layout is a single column on phones, two columns from `sm` and four
 * from `lg`:
 *
 * ```
 * grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]
 * ```
 *
 * The brand block takes the widest track because it carries the tagline and
 * the address; the three link columns share the rest. The link columns
 * themselves are a `<ul>` rather than a grid of columns, so the links stack
 * on a phone and read as a list on a desktop — a four-column grid of links
 * at 320 px would put four words on one line.
 *
 * The address is rendered with `<address>` so it is semantically an address,
 * and every long string is allowed to wrap rather than pushing the page
 * sideways.
 */

/**
 * The quick links, grouped into columns.
 *
 * Kept as data rather than markup so the columns stay consistent and the
 * whole block can be re-ordered in one place.
 */
const LINK_COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/app/products", label: "Catalogue" },
      { href: "/app/cart", label: "Your cart" },
      { href: "/app/orders", label: "Your orders" },
      { href: "/app/subscriptions", label: "Weekly baskets" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/app/account", label: "Your details" },
      { href: "/app/account/addresses", label: "Delivery addresses" },
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create an account" },
    ],
  },
  {
    title: "FreshTrace",
    links: [
      { href: "/app/products", label: "How freshness works" },
      { href: "/app/subscriptions", label: "Subscription plans" },
      { href: "/login", label: "Operations sign-in" },
    ],
  },
];

/**
 * The company's contact details.
 *
 * The hub address and the phone number are the only public-facing contact
 * points the product has.
 */
const CONTACT = {
  address: [
    "FreshTrace Hub",
    "House 12, Road 7, Banani",
    "Dhaka 1213, Bangladesh",
  ],
  phone: "+880 1700 000000",
  email: "hello@freshtrace.app",
};

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-sand-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        {/* ── Link grid ─────────────────────────────────────────────── */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:gap-8">
          {/* ── Brand ──────────────────────────────────────────────── */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/app/products"
              className="inline-flex items-center gap-2 font-semibold tracking-tight text-sand-900"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
                <Leaf className="size-5" aria-hidden="true" />
              </span>
              <span className="text-lg">FreshTrace</span>
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sand-600">
              Farm-to-table produce with visible freshness, delivered in Dhaka.
              Every batch is traceable back to its harvest.
            </p>

            <address className="mt-5 space-y-2 text-sm not-italic leading-relaxed text-sand-600">
              {CONTACT.address.map((line) => (
                <span key={line} className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 size-4 shrink-0 text-sand-400"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 break-words">{line}</span>
                </span>
              ))}

              <span className="flex items-center gap-2">
                <Phone
                  className="size-4 shrink-0 text-sand-400"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">{CONTACT.phone}</span>
              </span>

              <span className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-sand-400" aria-hidden="true" />
                <span className="min-w-0 break-words">{CONTACT.email}</span>
              </span>
            </address>
          </div>

          {/* ── Quick links ─────────────────────────────────────────── */}
          {LINK_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-sand-500">
                {column.title}
              </h2>

              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="inline-block text-sm text-sand-600 transition hover:text-brand-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ── Legal line ────────────────────────────────────────────── */}
        <div className="mt-10 flex flex-col items-start gap-3 border-t border-sand-100 pt-6 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-sand-500">
            © {year} FreshTrace. Farm-to-table marketplace, Dhaka.
          </p>

          <p className="text-xs text-sand-500">
            Prices are set by the freshness engine and refreshed daily.
          </p>
        </div>
      </div>
    </footer>
  );
}
