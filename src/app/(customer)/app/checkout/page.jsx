import Link from "next/link";
import { ArrowLeft, PackageCheck } from "lucide-react";
import CheckoutForm from "@/components/CheckoutForm";
import { requireCustomerSession } from "@/lib/auth/page-guard";
import { getAddressesForUser, getCartForUser } from "@/lib/cart";
import { formatBDT, formatQty, formatUnit } from "@/lib/freshness";

/**
 * Checkout.
 *
 * SRS §9.1: `(customer)/app/checkout/page.jsx` — the checkout.
 *
 * The page is a Server Component that reads the cart and the customer's
 * addresses directly through the service layer. Placing the order is the
 * client-side interaction, handled by `CheckoutForm`.
 */
export const metadata = {
  title: "Checkout — FreshTrace",
  description: "Choose where your produce should be delivered and place your order.",
};

export default async function CheckoutPage() {
  // Placing an order belongs to an account, so a signed-out visitor is sent
  // to the login screen and returned here afterwards.
  const user = await requireCustomerSession("/app/checkout");

  const [cart, addresses] = await Promise.all([
    getCartForUser(user.id),
    getAddressesForUser(user.id),
  ]);

  const buyableItems = cart.items.filter((line) => line.available);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/app/cart"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sand-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to cart
        </Link>
      </nav>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Checkout
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          Confirm where this should be delivered. Your stock is reserved the
          moment the order is placed.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Form ─────────────────────────────────────────────────── */}
        <div className="rounded-card border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur-md sm:p-6">
          <CheckoutForm
            items={buyableItems}
            addresses={addresses}
            subtotal={formatBDT(cart.subtotal)}
            deliveryFee={cart.deliveryFee > 0 ? formatBDT(cart.deliveryFee) : "—"}
            grandTotal={formatBDT(cart.grandTotal)}
          />
        </div>

        {/* ── Summary ─────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-sand-200 bg-white p-4 shadow-soft sm:p-6">
            <h2 className="text-base font-semibold text-sand-900">
              {buyableItems.length} item{buyableItems.length === 1 ? "" : "s"}
            </h2>

            <ul className="mt-4 space-y-3">
              {buyableItems.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-sand-800">
                      {line.productName}
                    </span>
                    <span className="text-xs text-sand-500">
                      {formatQty(line.qty)} {formatUnit(line.unit)}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-sand-900">
                    {formatBDT(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            {cart.items.length > buyableItems.length ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-sand-300 bg-sand-50 px-3 py-2 text-xs leading-relaxed text-sand-600">
                <PackageCheck
                  className="mt-0.5 size-3.5 shrink-0 text-sand-400"
                  aria-hidden="true"
                />
                Some items in your cart are no longer available and have been
                left out of this order.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
