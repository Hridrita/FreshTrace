import { redirect } from "next/navigation";
import { CalendarClock, MapPin, Package } from "lucide-react";
import SubscriptionControls from "@/components/SubscriptionControls";
import SubscriptionSetupForm from "@/components/SubscriptionSetupForm";
import SubscriptionStatusBadge from "@/components/SubscriptionStatusBadge";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSubscription,
  listActivePlans,
  parseComposition,
} from "@/lib/services/subscriptions";
import { formatBDT, formatDate, formatQty } from "@/lib/freshness";

/**
 * Subscriptions.
 *
 * SRS §9.1: `(customer)/app/subscriptions/page.jsx` — the subscriptions page.
 *
 * The page has two faces, and the customer's own subscription decides which
 * one they see:
 *
 * 1. **An active or paused subscription** — the plan, the status, the next
 *    delivery date and the items scheduled to arrive, plus the controls to
 *    pause, resume or cancel it.
 * 2. **No subscription** — the plans on offer and the setup form, so a
 *    customer can start a weekly basket.
 *
 * The page is a Server Component that reads through the service layer
 * (SRS §9.3). The subscription is scoped to the signed-in customer, so one
 * customer can never see another's plan.
 */
export const metadata = {
  title: "Your subscriptions — FreshTrace",
  description:
    "Set up a weekly basket of fresh produce, and manage the deliveries you have coming.",
};

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

export default async function SubscriptionsPage() {
  const session = await getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect("/login?next=%2Fapp%2Fsubscriptions");
  }

  const [subscription, plans] = await Promise.all([
    getCurrentSubscription(user.id),
    listActivePlans(),
  ]);

  // The setup form needs the customer's addresses and the product names, so
  // the basket preview reads in the customer's own language.
  const [addresses, products] = await Promise.all([
    prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, defaultUnit: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-sand-900">
          Weekly subscriptions
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          A basket of seasonal produce, picked fresh and delivered to your door
          on the same day each week. Pause it whenever you travel, and cancel
          it whenever you like.
        </p>
      </div>

      {subscription ? (
        <ActiveSubscription subscription={subscription} products={products} />
      ) : (
        <div className="mt-8">
          <SubscriptionSetupForm
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              basketSize: plan.basketSize,
              weeklyPrice: plan.weeklyPrice,
              description: plan.description,
              composition: plan.composition,
            }))}
            addresses={addresses.map((address) => ({
              id: address.id,
              label: address.label,
              line1: address.line1,
              area: address.area,
              city: address.city,
              isDefault: address.isDefault,
            }))}
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
              unit: product.defaultUnit,
            }))}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The active-plan view: what is subscribed, when it next arrives, and what
 * is in the basket.
 *
 * @param {object} props
 * @param {any} props.subscription
 * @param {Array<{ id: string, name: string, unit: string }>} props.products
 */
function ActiveSubscription({ subscription, products }) {
  const plan = subscription.plan;
  const address = subscription.address;
  const composition = parseComposition(plan?.composition);
  const isPaused = subscription.status === "paused";

  return (
    <div className="mt-8 space-y-5">
      {/* ── The plan itself ────────────────────────────────────────── */}
      <article className="overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/50 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-sand-900">
              {plan?.name ?? "Weekly basket"}
            </h2>
            <p className="mt-0.5 text-sm text-sand-500">
              {formatBDT(plan?.weeklyPrice ?? 0)} per week
            </p>
          </div>

          <SubscriptionStatusBadge status={subscription.status} />
        </div>

        <div className="grid gap-px bg-sand-100 sm:grid-cols-2">
          {/* Next delivery */}
          <div className="bg-white/80 px-5 py-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {isPaused ? "Paused until" : "Next delivery"}
            </div>

            <p className="mt-1.5 text-base font-semibold text-sand-900">
              {isPaused && subscription.pauseUntil
                ? formatDate(subscription.pauseUntil)
                : formatDate(subscription.nextDeliveryAt, {
                    weekday: "long",
                  })}
            </p>

            <p className="mt-0.5 text-sm text-sand-500">
              Every {WEEKDAY_NAMES[subscription.dayOfWeek]}
              {isPaused ? " — no deliveries while paused" : ""}
            </p>
          </div>

          {/* Delivery address */}
          <div className="bg-white/80 px-5 py-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
              <MapPin className="size-3.5" aria-hidden="true" />
              Delivering to
            </div>

            <p className="mt-1.5 text-base font-semibold text-sand-900">
              {address?.label ?? "Address"}
            </p>

            <p className="mt-0.5 text-sm text-sand-500">
              {address
                ? `${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.area}, ${address.city}`
                : "No address on file"}
            </p>
          </div>
        </div>

        {/* ── Scheduled items ────────────────────────────────────────── */}
        {composition.length > 0 ? (
          <div className="border-t border-sand-100 px-5 py-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sand-500">
              <Package className="size-3.5" aria-hidden="true" />
              Scheduled in this basket
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

        {/* ── Management ─────────────────────────────────────────────── */}
        <div className="border-t border-sand-100 px-5 py-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-sand-500">
            Manage subscription
          </h3>

          <div className="mt-3">
            <SubscriptionControls
              subscriptionId={subscription.id}
              status={subscription.status}
            />
          </div>
        </div>
      </article>

      <p className="text-xs leading-relaxed text-sand-500">
        The weekly price is the fresh-produce price and acts as a ceiling.
        Each delivery is charged at the actual freshness tier of what is picked
        that day, so your bill may come out lower. If the hub is closed on your
        delivery day, that week is skipped and your delivery moves on a week.
      </p>
    </div>
  );
}
