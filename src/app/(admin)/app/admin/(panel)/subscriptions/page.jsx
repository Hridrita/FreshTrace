import { Repeat } from "lucide-react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterSubmit,
  KpiCard,
  Panel,
  SearchInput,
  StatusPill,
} from "@/components/admin/AdminUI";
import { listSubscriptionsForAdmin } from "@/lib/services/admin-orders";
import { getAdminMetrics } from "@/lib/services/admin-metrics";
import { formatBDT, formatDate } from "@/lib/freshness";
import { SUBSCRIPTION_STATUSES } from "@/lib/constants";

/**
 * Subscription operations — `/app/admin/subscriptions`.
 *
 * Active baskets are the PRD's headline growth number, so the panel leads
 * with the plan mix and the delivery schedule rather than a raw row count.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Subscriptions",
  description: "Manage recurring basket subscriptions and their delivery schedule.",
};

/**
 * The tone for each subscription status.
 *
 * @param {string} status
 * @returns {string}
 */
function statusTone(status) {
  if (status === "active") return "success";
  if (status === "paused") return "warn";
  return "neutral";
}

export default async function AdminSubscriptionsPage({ searchParams }) {
  const params = await searchParams;

  const status = typeof params?.status === "string" ? params.status : "";
  const search = typeof params?.search === "string" ? params.search : "";

  const [subscriptions, metrics] = await Promise.all([
    listSubscriptionsForAdmin({
      status: status || undefined,
      search: search || undefined,
      limit: 100,
    }),
    getAdminMetrics(),
  ]);

  const byPlan = new Map();

  for (const subscription of subscriptions) {
    const key = subscription.plan.name;
    const bucket = byPlan.get(key) ?? { name: key, count: 0, price: subscription.plan.weeklyPrice };
    bucket.count += 1;
    byPlan.set(key, bucket);
  }

  const planMix = [...byPlan.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Subscriptions
        </h1>
        <p className="mt-1.5 text-sm text-sand-600">
          The recurring baskets that keep the hub&apos;s demand predictable.
        </p>
      </div>

      {/* ── KPI row ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Active baskets"
          value={metrics.activeBaskets.toLocaleString("en-BD")}
          hint="Subscriptions currently delivering"
          icon={<Repeat className="size-4" aria-hidden="true" />}
          progress={
            metrics.totalSubscriptions > 0
              ? (metrics.activeSubscriptions / metrics.totalSubscriptions) * 100
              : 0
          }
        />
        <KpiCard
          label="All subscriptions"
          value={metrics.totalSubscriptions.toLocaleString("en-BD")}
          hint="Active, paused and ended"
          icon={<Repeat className="size-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Average basket value"
          value={formatBDT(metrics.avgBasketValue)}
          hint={`${metrics.ordersInWindow} orders in the reporting window`}
          icon={<Repeat className="size-4" aria-hidden="true" />}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <FilterBar action="/app/admin/subscriptions">
        <SearchInput
          defaultValue={search}
          placeholder="Search customer or plan…"
        />
        <FilterSelect
          name="status"
          label="Subscription status"
          defaultValue={status}
          allLabel="All statuses"
          options={SUBSCRIPTION_STATUSES.map((value) => ({
            value,
            label: value.charAt(0).toUpperCase() + value.slice(1),
          }))}
        />
        <FilterSubmit />
      </FilterBar>

      {/* The plan-mix panel drops below the register on a phone and tablet.
          The `minmax(0,1fr)` track lets the table column shrink to fit
          rather than forcing the grid wider than the viewport. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        {/* ── Subscription table ────────────────────────────────────── */}
        <Panel
          title="Subscription register"
          description={`${subscriptions.length} subscription${subscriptions.length === 1 ? "" : "s"} matching the current filters.`}
        >
          {subscriptions.length === 0 ? (
            <EmptyState
              icon={<Repeat className="size-6" aria-hidden="true" />}
              title="No subscriptions match"
              description="Adjust the filters above to widen the search."
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "customer",
                  label: "Customer",
                  className: "font-medium text-sand-900",
                },
                { key: "plan", label: "Plan" },
                { key: "delivery", label: "Delivery" },
                { key: "next", label: "Next delivery" },
                { key: "orders", label: "Orders", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={subscriptions.map((subscription) => ({
                key: subscription.id,
                customer: (
                  <div>
                    <p className="break-words text-sand-800">
                      {subscription.customer?.name ?? subscription.customer?.email ?? "—"}
                    </p>
                    <p className="text-[11px] text-sand-500">
                      {subscription.address?.area ?? "—"}
                      {subscription.address?.city ? `, ${subscription.address.city}` : ""}
                    </p>
                  </div>
                ),
                plan: (
                  <div>
                    <p className="break-words text-sand-800">{subscription.plan.name}</p>
                    <p className="text-[11px] text-sand-500">
                      {formatBDT(subscription.plan.weeklyPrice)} / week
                    </p>
                  </div>
                ),
                delivery: (
                  <span className="text-xs text-sand-600">
                    {[
                      "Sun",
                      "Mon",
                      "Tue",
                      "Wed",
                      "Thu",
                      "Fri",
                      "Sat",
                    ][subscription.dayOfWeek] ?? "—"}
                  </span>
                ),
                next: formatDate(subscription.nextDeliveryAt),
                orders: subscription._count.orders,
                status: (
                  <StatusPill
                    label={subscription.status}
                    tone={statusTone(subscription.status)}
                  />
                ),
              }))}
            />
          )}
        </Panel>

        {/* ── Plan mix ──────────────────────────────────────────────── */}
        <Panel title="Plan mix" description="Across the filtered subscriptions.">
          {planMix.length === 0 ? (
            <EmptyState
              icon={<Repeat className="size-6" aria-hidden="true" />}
              title="No plans in view"
            />
          ) : (
            <ul className="divide-y divide-sand-100/70">
              {planMix.map((plan) => {
                const share =
                  subscriptions.length > 0
                    ? (plan.count / subscriptions.length) * 100
                    : 0;

                return (
                  <li key={plan.name} className="px-5 py-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-sand-800">{plan.name}</span>
                      <span className="text-sm font-semibold text-sand-900">{plan.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sand-200/70">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-sand-500">
                      {share.toFixed(0)}% of subscriptions · {formatBDT(plan.price)}/week
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
