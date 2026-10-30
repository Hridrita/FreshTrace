import Link from "next/link";
import { PackageSearch } from "lucide-react";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { requireCustomerSession } from "@/lib/auth/page-guard";
import { listOrders } from "@/lib/services/orders";
import { formatBDT, formatDate, formatQty } from "@/lib/freshness";

/**
 * Customer order history.
 *
 * SRS §9.1: `(customer)/app/orders/page.jsx` — the order list.
 *
 * The page reads the orders directly through the service layer (SRS §9.3)
 * and the service itself scopes the query to the signed-in customer, so a
 * customer can never see another customer's orders.
 */
export const metadata = {
  title: "Your orders — FreshTrace",
  description: "Track the produce you have ordered and when it was harvested.",
};

export default async function OrdersPage() {
  // Orders belong to an account, so a signed-out visitor is sent to the
  // login screen and returned here afterwards.
  const user = await requireCustomerSession("/app/orders");

  const orders = await listOrders(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Your orders
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          Every order records the batch it came from, so you can always see
          exactly how fresh your produce was when it was picked.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-card border border-dashed border-sand-300 bg-white px-6 py-14 text-center sm:py-20">
          <span className="flex size-12 items-center justify-center rounded-full bg-sand-100 text-sand-400">
            <PackageSearch className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-sand-900">
            No orders yet
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-sand-600">
            Fill your basket from the catalogue and your orders will appear here.
          </p>
          <Link
            href="/app/products"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-sand-900">
                    {order.orderCode}
                  </p>
                  <p className="text-xs text-sand-500">
                    Placed {formatDate(order.placedAt)}
                  </p>
                </div>

                <OrderStatusBadge status={order.status} />
              </div>

              <div className="px-4 py-4">
                <ul className="space-y-2">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-sand-800">
                          {item.name}
                        </span>
                        <span className="ml-2 text-xs text-sand-500">
                          {formatQty(item.qty)} × {formatBDT(item.unitPrice)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-sand-900">
                        {formatBDT(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 px-4 py-3">
                <span className="text-sm text-sand-500">
                  {order.items.length} item{order.items.length === 1 ? "" : "s"}
                </span>

                <div className="flex items-center gap-4">
                  <span className="text-base font-semibold tracking-tight text-sand-900">
                    {formatBDT(order.grandTotal)}
                  </span>

                  <Link
                    href={`/app/orders/${order.id}`}
                    className="shrink-0 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-sand-700 transition hover:bg-sand-50"
                  >
                    View details
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
