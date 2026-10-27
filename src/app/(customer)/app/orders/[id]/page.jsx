import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin, Truck } from "lucide-react";
import FreshnessBadge from "@/components/FreshnessBadge";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { getSession } from "@/lib/auth/session";
import { getOrder } from "@/lib/services/orders";
import { formatBDT, formatDate, formatQty, formatUnit } from "@/lib/freshness";

/**
 * Order detail.
 *
 * SRS §9.1: `(customer)/app/orders/[id]/page.jsx` — the order detail.
 *
 * The service scopes the lookup to the signed-in customer, so another
 * customer's order is reported as `not_found` rather than `forbidden` — the
 * response never discloses that the order exists.
 */
export const metadata = {
  title: "Order details — FreshTrace",
  description: "The produce in your order, with the batch and freshness it came from.",
};

export default async function OrderDetailPage({ params }) {
  const { id } = await params;

  const session = await getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/app/orders/${id}`)}`);
  }

  const order = await getOrder(user.id, id).catch(() => null);

  if (!order) {
    notFound();
  }

  // The address is a frozen JSON snapshot taken at order time, so it is
  // parsed rather than joined to the customer's current address.
  const address = parseAddressSnapshot(order.addressSnapshot);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/app/orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sand-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to orders
        </Link>
      </nav>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-sand-900">
            {order.orderCode}
          </h1>
          <p className="mt-1 text-sm text-sand-600">
            Placed {formatDate(order.placedAt)}
          </p>
        </div>

        <OrderStatusBadge status={order.status} />
      </div>

      {order.status === "pending_payment" ? (
        <div className="mt-6 flex items-start gap-3 rounded-card border border-sand-200 bg-sand-50 px-4 py-3">
          <Truck className="mt-0.5 size-4 shrink-0 text-sand-400" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-sand-600">
            This order is awaiting payment. Payment is handled at checkout and
            your produce is reserved while the order waits.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Lines ────────────────────────────────────────────────── */}
        <div className="rounded-card border border-white/40 bg-white/70 p-6 shadow-soft backdrop-blur-md">
          <h2 className="text-base font-semibold text-sand-900">
            What you ordered
          </h2>

          <ul className="mt-4 divide-y divide-sand-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">{item.name}</span>
                    <FreshnessBadge tier={item.freshnessTierAtOrder} size="sm" />
                  </div>

                  <p className="mt-1 text-xs text-sand-500">
                    {formatQty(item.qty)} × {formatBDT(item.unitPrice)}
                  </p>
                </div>

                <span className="shrink-0 font-medium text-sand-900">
                  {formatBDT(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2.5 border-t border-sand-200 pt-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sand-600">Subtotal</dt>
              <dd className="font-medium text-sand-900">
                {formatBDT(order.subtotal)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sand-600">Delivery</dt>
              <dd className="font-medium text-sand-900">
                {formatBDT(order.deliveryFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-sand-200 pt-2.5 text-base">
              <dt className="font-semibold text-sand-900">Total</dt>
              <dd className="font-semibold tracking-tight text-sand-900">
                {formatBDT(order.grandTotal)}
              </dd>
            </div>
          </dl>
        </div>

        {/* ── Delivery address ─────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-sand-200 bg-white p-6 shadow-soft">
            <h2 className="flex items-center gap-2 text-base font-semibold text-sand-900">
              <MapPin className="size-4 text-sand-400" aria-hidden="true" />
              Delivery address
            </h2>

            {address ? (
              <address className="mt-3 text-sm not-italic leading-relaxed text-sand-600">
                <span className="block font-medium text-sand-800">
                  {address.label}
                </span>
                <span className="mt-1 block">{address.line1}</span>
                {address.line2 ? <span className="block">{address.line2}</span> : null}
                <span className="block">
                  {address.area}, {address.city}
                </span>
                {address.deliveryNotes ? (
                  <span className="mt-2 block text-xs text-sand-500">
                    {address.deliveryNotes}
                  </span>
                ) : null}
              </address>
            ) : (
              <p className="mt-3 text-sm text-sand-500">No address recorded.</p>
            )}

            <p className="mt-4 flex items-start gap-2 border-t border-sand-100 pt-4 text-xs leading-relaxed text-sand-500">
              <CheckCircle2
                className="mt-0.5 size-3.5 shrink-0 text-fresh-500"
                aria-hidden="true"
              />
              This address was frozen when the order was placed, so later
              changes to your saved address do not affect it.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Parse the frozen address snapshot.
 *
 * The snapshot is written as JSON by the order service. A malformed
 * snapshot must not crash the page — an unreadable address is reported as
 * absent rather than taking the whole order down.
 *
 * @param {string} snapshot
 * @returns {Record<string, string> | null}
 */
function parseAddressSnapshot(snapshot) {
  try {
    const parsed = JSON.parse(snapshot);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
