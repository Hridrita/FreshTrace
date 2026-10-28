import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Coins,
  PackageCheck,
  Percent,
  RefreshCw,
  Repeat,
  ShoppingBasket,
  TrendingUp,
} from "lucide-react";
import {
  DataTable,
  EmptyState,
  KpiCard,
  Panel,
  ProgressPill,
  StatusPill,
} from "@/components/admin/AdminUI";
import { getAdminMetrics, getTierDistribution } from "@/lib/services/admin-metrics";
import { listBatchesForQc } from "@/lib/services/admin-qc";
import { listRefunds } from "@/lib/services/admin-orders";
import { formatBDT, formatDate, formatQty } from "@/lib/freshness";
import { getTierPresentation } from "@/lib/freshness";

/**
 * Admin & QC executive overview — `/app/admin`.
 *
 * The five headline metrics are the PRD's success criteria: QC pass rate,
 * spoilage rate, refund rate, gross margin per basket, and active
 * subscriptions. They are computed from the operational record rather than
 * stored, so the dashboard cannot drift from the data.
 *
 * Below the KPI row the panel shows the three queues an operator actually
 * works from: batches waiting on QC, refunds waiting on a decision, and
 * stock that is about to delist.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Dashboard",
  description: "Executive overview of FreshTrace operations and quality control.",
};

export default async function AdminDashboardPage() {
  const now = new Date();

  const [metrics, tierDistribution, qcQueue, refunds] = await Promise.all([
    getAdminMetrics({ now }),
    getTierDistribution(),
    listBatchesForQc({ status: "in_transit", limit: 6 }),
    listRefunds({ status: "requested", limit: 6 }),
  ]);

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
            Operations overview
          </h1>
          <p className="mt-1.5 text-sm text-sand-600">
            Live picture of the hub, the shelf, and the last {metrics.windowDays} days
            of trading.
          </p>
        </div>

        <p className="text-xs text-sand-500">
          As of {formatDate(now, { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>

      {/* ── KPI row ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <KpiCard
          label="Active baskets"
          value={metrics.activeBaskets.toLocaleString("en-BD")}
          hint={`${metrics.activeSubscriptions} of ${metrics.totalSubscriptions} subscriptions active`}
          icon={<ShoppingBasket className="size-4" aria-hidden="true" />}
          progress={
            metrics.totalSubscriptions > 0
              ? (metrics.activeSubscriptions / metrics.totalSubscriptions) * 100
              : 0
          }
          tone="accent"
        />

        <KpiCard
          label="Total subscriptions"
          value={metrics.totalSubscriptions.toLocaleString("en-BD")}
          hint={`${metrics.ordersInWindow} orders in the reporting window`}
          icon={<Repeat className="size-4" aria-hidden="true" />}
          progress={
            metrics.activeSubscriptions > 0
              ? (metrics.activeSubscriptions / metrics.totalSubscriptions) * 100
              : 0
          }
          tone="accent"
        />

        <KpiCard
          label="QC pass rate"
          value={metrics.qcPassRate.toFixed(1)}
          suffix="%"
          hint="Target ≥ 80% — PRD success criterion #5"
          icon={<ClipboardCheck className="size-4" aria-hidden="true" />}
          progress={metrics.qcPassRate}
          tone={metrics.qcPassRate >= 80 ? "success" : "warn"}
        />

        <KpiCard
          label="Refund / spoilage rate"
          value={Math.max(metrics.refundRate, metrics.spoilageRate).toFixed(1)}
          suffix="%"
          hint={`${metrics.refundRate.toFixed(1)}% refunds · ${metrics.spoilageRate.toFixed(1)}% spoilage — target < 5%`}
          icon={<Percent className="size-4" aria-hidden="true" />}
          progress={Math.max(metrics.refundRate, metrics.spoilageRate) * 5}
          tone={Math.max(metrics.refundRate, metrics.spoilageRate) < 5 ? "success" : "danger"}
        />

        <KpiCard
          label="Gross margin / basket"
          value={metrics.grossMarginPercent.toFixed(1)}
          suffix="%"
          hint={`${formatBDT(metrics.grossMarginPerBasket)} per basket · target ≥ 25%`}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          progress={metrics.grossMarginPercent * 2}
          tone={metrics.grossMarginPercent >= 25 ? "success" : "warn"}
        />
      </div>

      {/* ── Queue summary strip ────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressPill
          icon={<ClipboardCheck className="size-3.5" aria-hidden="true" />}
          label="Awaiting QC"
          value={metrics.pendingQcBatches.toLocaleString("en-BD")}
          tone={metrics.pendingQcBatches > 0 ? "warn" : "success"}
          href="/app/admin/batches"
        />
        <ProgressPill
          icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
          label="Refunds pending"
          value={metrics.pendingRefunds.toLocaleString("en-BD")}
          tone={metrics.pendingRefunds > 0 ? "warn" : "success"}
          href="/app/admin/orders"
        />
        <ProgressPill
          icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
          label="Delisting soon"
          value={metrics.expiringSoonBatches.toLocaleString("en-BD")}
          tone={metrics.expiringSoonBatches > 0 ? "danger" : "success"}
          href="/app/admin/batches"
        />
        <ProgressPill
          icon={<Coins className="size-3.5" aria-hidden="true" />}
          label="Revenue (window)"
          value={formatBDT(metrics.revenueInWindow)}
          tone="accent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── QC queue ────────────────────────────────────────────── */}
        <Panel
          title="Awaiting QC inspection"
          description="Inbound batches from aggregators, awaiting a hub decision."
          actions={
            <Link
              href="/app/admin/batches"
              className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-200"
            >
              Open QC desk
            </Link>
          }
        >
          {qcQueue.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="size-6" aria-hidden="true" />}
              title="Nothing waiting"
              description="Every inbound batch has been inspected. New arrivals will appear here."
            />
          ) : (
            <DataTable
              minWidth="30rem"
              columns={[
                {
                  key: "batch",
                  label: "Batch",
                  className: "font-medium text-sand-900",
                },
                { key: "origin", label: "Origin" },
                { key: "qty", label: "Inbound", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={qcQueue.map((batch) => ({
                key: batch.id,
                batch: (
                  <div>
                    <p className="font-mono text-[13px] text-sand-900">{batch.batchCode}</p>
                    <p className="text-xs text-sand-500">{batch.product.name}</p>
                  </div>
                ),
                origin: batch.originDistrict,
                qty: `${formatQty(batch.inboundQty)} kg`,
                status: <StatusPill label="In transit" tone="accent" />,
              }))}
            />
          )}
        </Panel>

        {/* ── Refund queue ────────────────────────────────────────── */}
        <Panel
          title="Refund &amp; replacement requests"
          description="Decisions the operations team still owes a customer."
          actions={
            <Link
              href="/app/admin/orders"
              className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-200"
            >
              Open orders
            </Link>
          }
        >
          {refunds.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="size-6" aria-hidden="true" />}
              title="No open requests"
              description="Refund and replacement requests will queue up here for a decision."
            />
          ) : (
            <DataTable
              minWidth="30rem"
              columns={[
                {
                  key: "order",
                  label: "Order",
                  className: "font-medium text-sand-900",
                },
                { key: "customer", label: "Customer" },
                { key: "amount", label: "Amount", align: "right" },
                { key: "reason", label: "Reason" },
              ]}
              rows={refunds.map((refund) => ({
                key: refund.id,
                order: (
                  <p className="font-mono text-[13px] text-sand-900">
                    {refund.order.orderCode}
                  </p>
                ),
                customer: refund.order.customer?.name ?? refund.order.customer?.email ?? "—",
                amount: formatBDT(refund.amount),
                reason: (
                  <span className="line-clamp-1 text-xs text-sand-600">{refund.reason}</span>
                ),
              }))}
            />
          )}
        </Panel>
      </div>

      {/* ── Freshness distribution ─────────────────────────────────── */}
      <Panel
        title="Freshness distribution"
        description="Currently listed stock, by freshness tier. The pricing engine re-prices these on every read."
      >
        {tierDistribution.length === 0 ? (
          <EmptyState
            icon={<PackageCheck className="size-6" aria-hidden="true" />}
            title="No stock listed"
            description="Once batches pass QC and are listed, their freshness spread appears here."
          />
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {tierDistribution.map((entry) => {
              const presentation = getTierPresentation(entry.tier);
              const totalQty = tierDistribution.reduce((sum, item) => sum + item.qty, 0);
              const share = totalQty > 0 ? (entry.qty / totalQty) * 100 : 0;

              return (
                <div
                  key={entry.tier}
                  className="rounded-2xl border border-white/70 bg-white/60 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill label={presentation.label} tone={toneForTier(entry.tier)} />
                    <span className="text-xs font-medium text-sand-500">
                      {entry.batches} batch{entry.batches === 1 ? "" : "es"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold tracking-tight text-sand-900">
                    {formatQty(entry.qty)} kg
                  </p>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-sand-200/70">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-sand-500">
                    {share.toFixed(0)}% of listed stock
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * Map a freshness tier onto a status tone.
 *
 * @param {string} tier
 * @returns {string}
 */
function toneForTier(tier) {
  switch (tier) {
    case "fresh":
      return "success";
    case "good":
      return "info";
    case "fair":
      return "warn";
    case "near_expiry":
      return "warn";
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}
