import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  MapPin,
  Package,
  Receipt,
  User,
} from "lucide-react";
import AddressManager from "@/components/AddressManager";
import ProfileForm from "@/components/ProfileForm";
import SubscriptionStatusBadge from "@/components/SubscriptionStatusBadge";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSubscription,
  parseComposition,
} from "@/lib/services/subscriptions";
import { listAddresses } from "@/lib/services/addresses";
import { listOrders } from "@/lib/services/orders";
import { toAddressViews } from "@/lib/account-view";
import { formatBDT, formatDate, formatQty } from "@/lib/freshness";

/**
 * The customer account page.
 *
 * SRS §9.1 places the customer's account at `(customer)/app/account/page.jsx`.
 * The page brings together the three things a customer comes back for:
 *
 * 1. **Their details** — the display name and the email they registered
 *    with, plus the delivery address the courier uses.
 * 2. **Their subscription** — whether one is running, what is in the weekly
 *    basket and when the next delivery lands.
 * 3. **Their orders** — a short summary of recent orders, with a link to
 *    the full history.
 *
 * Everything is read through the service layer (SRS §9.3), and every query
 * is scoped to the signed-in customer, so one customer can never see
 * another's details.
 */
export const metadata = {
  title: "Your account — FreshTrace",
  description:
    "Manage your details, delivery addresses, weekly subscription and order history.",
};

export default async function AccountPage() {
  const session = await getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect("/login?next=%2Fapp%2Faccount");
  }

  // The subscription, the addresses, the orders and the product names for
  // the basket preview are independent reads, so they run together.
  const [subscription, addresses, orders, products] = await Promise.all([
    getCurrentSubscription(user.id),
    listAddresses(user.id),
    listOrders(user.id),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, defaultUnit: true },
    }),
  ]);

  const recentOrders = orders.slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Your account
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          Your details, where we deliver, and what is on its way — all in one
          place.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {/* ── Profile ──────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5">
            <User className="size-4 shrink-0 text-sand-500" aria-hidden="true" />
            <h2 className="text-base font-semibold tracking-tight text-sand-900">
              Your details
            </h2>
          </div>

          <div className="p-4 sm:p-5">
            <ProfileForm
              profile={{
                name: user.name,
                email: user.email,
              }}
            />
          </div>
        </section>

        {/* ── Delivery addresses ───────────────────────────────────── */}
        <section className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-sand-500" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight text-sand-900">
                Delivery addresses
              </h2>
            </div>

            <Link
              href="/app/account/addresses"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 transition hover:text-brand-800"
            >
              Manage addresses
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="p-4 sm:p-5">
            <p className="mb-4 text-sm leading-relaxed text-sand-600">
              The address you pick as the default is the one your weekly
              deliveries go to.
            </p>

            <AddressManager addresses={toAddressViews(addresses)} />
          </div>
        </section>

        {/* ── Subscription ─────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <Package className="size-4 shrink-0 text-sand-500" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight text-sand-900">
                Your subscription
              </h2>
            </div>

            {subscription ? (
              <SubscriptionStatusBadge status={subscription.status} />
            ) : null}
          </div>

          {subscription ? (
            <SubscriptionOverview
              subscription={subscription}
              products={products}
            />
          ) : (
            <div className="px-4 py-8 text-center sm:px-5">
              <h3 className="text-base font-semibold text-sand-900">
                No subscription yet
              </h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-sand-600">
                Start a weekly basket and the produce you have chosen will
                arrive on the same day each week.
              </p>

              <Link
                href="/app/subscriptions"
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Choose a weekly basket
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        {/* ── Orders ───────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 shrink-0 text-sand-500" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight text-sand-900">
                Recent orders
              </h2>
            </div>

            <Link
              href="/app/orders"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 transition hover:text-brand-800"
            >
              View all orders
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="px-4 py-8 text-center sm:px-5">
              <p className="text-sm text-sand-600">
                You have not ordered anything yet.
              </p>

              <Link
                href="/app/products"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3.5 py-2 text-sm font-medium text-sand-700 transition hover:bg-sand-50"
              >
                Browse the catalogue
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-sand-100">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/app/orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-sand-50/60 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium text-sand-900">
                        {order.orderCode}
                      </p>
                      <p className="text-xs text-sand-500">
                        Placed {formatDate(order.placedAt)} ·{" "}
                        {order.items.length} item
                        {order.items.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-sand-900">
                        {formatBDT(order.grandTotal)}
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-sand-400"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The weekday names, matching the `dayOfWeek` values the schema stores.
 */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The subscription overview: the plan, when it next arrives, where it goes
 * and what is in the basket.
 *
 * @param {object} props
 * @param {any} props.subscription
 * @param {Array<{ id: string, name: string, unit: string }>} props.products
 */
function SubscriptionOverview({ subscription, products }) {
  const plan = subscription.plan;
  const address = subscription.address;
  const composition = parseComposition(plan?.composition);
  const isPaused = subscription.status === "paused";

  return (
    <div>
      <div className="grid gap-px bg-sand-100 sm:grid-cols-2">
        {/* Next delivery */}
        <div className="bg-white/80 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            {isPaused ? "Paused until" : "Next delivery"}
          </div>

          <p className="mt-1.5 text-base font-semibold text-sand-900">
            {isPaused && subscription.pauseUntil
              ? formatDate(subscription.pauseUntil)
              : formatDate(subscription.nextDeliveryAt, { weekday: "long" })}
          </p>

          <p className="mt-0.5 text-sm text-sand-500">
            Every {WEEKDAY_NAMES[subscription.dayOfWeek]}
            {isPaused ? " — no deliveries while paused" : ""}
          </p>
        </div>

        {/* Delivery address */}
        <div className="bg-white/80 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            Delivering to
          </div>

          <p className="mt-1.5 text-base font-semibold text-sand-900">
            {address?.label ?? "Address"}
          </p>

          <p className="mt-0.5 break-words text-sm text-sand-500">
            {address
              ? `${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.area}, ${address.city}`
              : "No address on file"}
          </p>
        </div>
      </div>

      {/* ── The plan ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sand-900">
            {plan?.name ?? "Weekly basket"}
          </p>
          <p className="mt-0.5 text-xs text-sand-500">
            {formatBDT(plan?.weeklyPrice ?? 0)} per week ·{" "}
            {plan?.basketSize ?? "standard"} basket
          </p>
        </div>

        <Link
          href="/app/subscriptions"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 transition hover:text-brand-800"
        >
          Manage subscription
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* ── Subscribed items ───────────────────────────────────────── */}
      {composition.length > 0 ? (
        <div className="border-t border-sand-100 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
            <Package className="size-3.5 shrink-0" aria-hidden="true" />
            Items in your weekly basket
          </div>

          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {composition.map((item) => {
              const product = products.find((p) => p.id === item.productId);

              return (
                <li
                  key={item.productId}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-sand-700">
                    {product?.name ?? "Seasonal produce"}
                  </span>
                  <span className="shrink-0 text-xs text-sand-500">
                    {formatQty(item.defaultQty)} {product?.unit ?? "kg"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
