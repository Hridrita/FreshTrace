import Link from "next/link";
import { ArrowLeft, ShoppingBasket, Truck } from "lucide-react";
import CartLineItem from "@/components/CartLineItem";
import { requireCustomerSession } from "@/lib/auth/page-guard";
import { getCartForUser } from "@/lib/cart";
import { formatBDT } from "@/lib/freshness";

/**
 * Shopping cart.
 *
 * SRS §9.1: `(customer)/app/cart/page.jsx` — the cart.
 *
 * A Server Component that reads the cart through the service layer, so the
 * prices shown here are the same prices the API quotes and the same prices
 * the order will be placed at.
 */
export const metadata = {
  title: "Your cart — FreshTrace",
  description: "Review the produce in your basket before placing your order.",
};

export default async function CartPage() {
  // A cart belongs to a customer, so a signed-out visitor is sent to the
  // login screen. The `next` parameter brings them back afterwards.
  const user = await requireCustomerSession("/app/cart");

  const cart = await getCartForUser(user.id);

  const hasItems = cart && cart.items.length > 0;
  const hasBuyableItems = cart && cart.items.some((line) => line.available);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Your cart
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          Prices are recomputed from each batch&apos;s freshness every time you
          open this page, so what you see here is what you will be charged.
        </p>
      </div>

      {!hasItems ? (
        <EmptyCart />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Lines ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {cart.items.map((line) => (
              <CartLineItem key={line.id} line={line} />
            ))}
          </div>

          {/* ── Summary ───────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-card border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-md">
              <h2 className="text-lg font-semibold text-sand-900">Order summary</h2>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sand-600">Items</dt>
                  <dd className="font-medium text-sand-900">{cart.itemCount}</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sand-600">Subtotal</dt>
                  <dd className="font-medium text-sand-900">
                    {formatBDT(cart.subtotal)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-sand-600">
                    <Truck className="size-4 shrink-0" aria-hidden="true" />
                    Delivery
                  </dt>
                  <dd className="font-medium text-sand-900">
                    {cart.deliveryFee > 0 ? formatBDT(cart.deliveryFee) : "—"}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-sand-200 pt-3 text-base">
                  <dt className="font-semibold text-sand-900">Total</dt>
                  <dd className="font-semibold tracking-tight text-sand-900">
                    {formatBDT(cart.grandTotal)}
                  </dd>
                </div>
              </dl>

              {hasBuyableItems ? (
                <Link
                  href="/app/checkout"
                  className="mt-6 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Continue to checkout
                </Link>
              ) : (
                <p className="mt-6 rounded-lg border border-dashed border-sand-300 bg-sand-50 px-4 py-3 text-sm text-sand-600">
                  Every item in your cart has sold out. Remove them to continue
                  shopping.
                </p>
              )}

              <Link
                href="/app/products"
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-sand-700 transition hover:bg-sand-50"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Continue shopping
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * The empty state.
 */
function EmptyCart() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-card border border-dashed border-sand-300 bg-white px-6 py-14 text-center sm:py-20">
      <span className="flex size-12 items-center justify-center rounded-full bg-sand-100 text-sand-400">
        <ShoppingBasket className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-sand-900">
        Your cart is empty
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-sand-600">
        Browse the catalogue and add the produce you would like. Everything you
        add keeps its harvest date and freshness tier.
      </p>
      <Link
        href="/app/products"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        Browse the catalogue
      </Link>
    </div>
  );
}
