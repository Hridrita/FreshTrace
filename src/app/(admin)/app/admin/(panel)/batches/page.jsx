import Link from "next/link";
import { ClipboardCheck, PackageCheck, RefreshCw } from "lucide-react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterSubmit,
  Panel,
  SearchInput,
  StatusPill,
} from "@/components/admin/AdminUI";
import QcInspectionForm from "@/components/admin/QcInspectionForm";
import { listBatchesForQc } from "@/lib/services/admin-qc";
import { formatDate, formatQty } from "@/lib/freshness";
import { getTierPresentation } from "@/lib/freshness";
import { BATCH_STATUSES, QC_STATUSES } from "@/lib/constants";

/**
 * Batches & QC inspection desk — `/app/admin/batches`.
 *
 * The page is the hub's working surface: a queue of batches moving through
 * `Listed → Received at Hub → QC Passed`, and a form to record what the
 * inspector saw.
 *
 * The filters are a plain GET form, so the filtered view is a real URL that
 * can be bookmarked or shared with another operator.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Batches & QC",
  description: "Review inbound aggregator batches and log QC inspections.",
};

/**
 * The batch lifecycle, in the order the hub experiences it.
 *
 * @type {Record<string, { label: string, tone: string }>}
 */
const BATCH_STATUS_PRESENTATION = {
  in_transit: { label: "In transit", tone: "accent" },
  listed: { label: "Listed", tone: "success" },
  delisted: { label: "Delisted", tone: "danger" },
  sold_out: { label: "Sold out", tone: "neutral" },
};

/**
 * The QC outcome, as a pill.
 *
 * @param {string} qcStatus
 * @returns {string}
 */
function qcTone(qcStatus) {
  if (qcStatus === "passed") return "success";
  if (qcStatus === "failed") return "danger";
  return "neutral";
}

export default async function AdminBatchesPage({ searchParams }) {
  const params = await searchParams;

  const status = typeof params?.status === "string" ? params.status : "";
  const qcStatus = typeof params?.qcStatus === "string" ? params.qcStatus : "";
  const search = typeof params?.search === "string" ? params.search : "";

  const [batches, queue] = await Promise.all([
    listBatchesForQc({
      status: status || undefined,
      qcStatus: qcStatus || undefined,
      search: search || undefined,
      limit: 100,
    }),
    listBatchesForQc({ status: "in_transit", limit: 50 }),
  ]);

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Batches &amp; QC
        </h1>
        <p className="mt-1.5 text-sm text-sand-600">
          Receive aggregator batches, log the inspection, and let the freshness
          engine re-price the shelf.
        </p>
      </div>

      {/* ── Lifecycle strip ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3.5 shadow-soft backdrop-blur-md">
        {[
          { label: "Listed by aggregator", tone: "neutral" },
          { label: "Received at hub", tone: "accent" },
          { label: "QC passed", tone: "success" },
        ].map((step, index) => (
          <div key={step.label} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-sand-300" aria-hidden="true">
                →
              </span>
            ) : null}
            <StatusPill label={step.label} tone={step.tone} />
          </div>
        ))}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <FilterBar action="/app/admin/batches">
        <SearchInput
          defaultValue={search}
          placeholder="Search batch code, product or district…"
        />
        <FilterSelect
          name="status"
          label="Batch status"
          defaultValue={status}
          allLabel="All statuses"
          options={BATCH_STATUSES.map((value) => ({
            value,
            label: BATCH_STATUS_PRESENTATION[value]?.label ?? value,
          }))}
        />
        <FilterSelect
          name="qcStatus"
          label="QC status"
          defaultValue={qcStatus}
          allLabel="All QC states"
          options={QC_STATUSES.map((value) => ({
            value,
            label: value.charAt(0).toUpperCase() + value.slice(1),
          }))}
        />
        <FilterSubmit />
      </FilterBar>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* ── Batch table ───────────────────────────────────────────── */}
        <Panel
          title="Batch register"
          description={`${batches.length} batch${batches.length === 1 ? "" : "es"} matching the current filters.`}
        >
          {batches.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="size-6" aria-hidden="true" />}
              title="No batches match"
              description="Adjust the filters above to widen the search."
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: "batch",
                  label: "Batch",
                  className: "font-medium text-sand-900",
                },
                { key: "aggregator", label: "Aggregator" },
                { key: "harvest", label: "Harvested" },
                { key: "qty", label: "Qty", align: "right" },
                { key: "tier", label: "Tier" },
                { key: "status", label: "Status" },
                { key: "qc", label: "QC" },
              ]}
              rows={batches.map((batch) => {
                const tierPresentation = getTierPresentation(batch.currentTier);
                const statusPresentation =
                  BATCH_STATUS_PRESENTATION[batch.status] ?? {
                    label: batch.status,
                    tone: "neutral",
                  };
                const lastLog = batch.qcLogs[0];

                return {
                  key: batch.id,
                  batch: (
                    <div>
                      <p className="font-mono text-[13px] text-sand-900">{batch.batchCode}</p>
                      <p className="text-xs text-sand-500">{batch.product.name}</p>
                    </div>
                  ),
                  aggregator:
                    batch.aggregator.companyName ??
                    batch.aggregator.name ??
                    batch.aggregator.email,
                  harvest: formatDate(batch.harvestDate),
                  qty: `${formatQty(batch.availableQty)} kg`,
                  tier: (
                    <StatusPill
                      label={tierPresentation.label}
                      tone={tierPresentation.tone === "neutral" ? "neutral" : tierPresentation.tone}
                    />
                  ),
                  status: (
                    <StatusPill
                      label={statusPresentation.label}
                      tone={statusPresentation.tone}
                    />
                  ),
                  qc: (
                    <span className="flex flex-col gap-1">
                      <StatusPill label={batch.qcStatus} tone={qcTone(batch.qcStatus)} />
                      {lastLog ? (
                        <span className="text-[11px] text-sand-500">
                          Grade {lastLog.grade} · {formatDate(lastLog.inspectedAt)}
                        </span>
                      ) : null}
                    </span>
                  ),
                };
              })}
            />
          )}
        </Panel>

        {/* ── Inspection form ───────────────────────────────────────── */}
        <Panel
          title="Log a QC inspection"
          description="Record what you saw at the bench. The batch is re-priced automatically."
        >
          <div className="p-5">
            <QcInspectionForm batches={queue} />
          </div>
        </Panel>
      </div>

      {/* ── Engine note ─────────────────────────────────────────────── */}
      <Panel title="Freshness &amp; pricing engine">
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-sand-600">
            The tier is recalculated from the batch&apos;s harvest date and the QC
            timestamp on every inspection. The same rule-based engine prices the
            customer catalogue, so a price shown here is the price a customer is
            charged.
          </p>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { day: "Day 1", multiplier: "100%", tier: "Fresh", tone: "success" },
              { day: "Day 3", multiplier: "80%", tier: "Good", tone: "info" },
              { day: "Day 5", multiplier: "60%", tier: "Fair", tone: "warn" },
              { day: "Day 7", multiplier: "Delisted", tier: "Expired", tone: "danger" },
            ].map((rule) => (
              <li
                key={rule.day}
                className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-sand-900">{rule.day}</span>
                  <StatusPill label={rule.tier} tone={rule.tone} />
                </div>
                <p className="mt-1.5 text-xs text-sand-500">
                  {rule.multiplier} of base price
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-sand-500">
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Multipliers are tunable via the{" "}
            <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">
              DECAY_DAY*_MULTIPLIER
            </code>{" "}
            environment variables.
          </p>
        </div>
      </Panel>
    </div>
  );
}
