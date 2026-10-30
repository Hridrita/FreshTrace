"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatBDT, formatQty, formatUnit, getTierPresentation } from "@/lib/freshness";

/**
 * CartLineItem — one line in the shopping cart.
 *
 * The line is a Client Component because changing a quantity is an
 * interaction: it calls the cart API and the page refreshes. Everything
 * else about the line is rendered from the server-provided data.
 *
 * A line whose batch is no longer buyable (sold out, delisted or expired)
 * is shown with the reason rather than hidden, so the customer understands
 * why the total changed.
 *
 * @param {object} props
 * @param {import("@/lib/services/cart").CartLine} props.line
 */
export default function CartLineItem({ line }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const presentation = getTierPresentation(line.tier);

  /**
   * Apply a quantity change and refresh the page.
   *
   * @param {number} qty
   */
  function changeQty(qty) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/cart/items/${line.batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The quantity could not be updated.");
        return;
      }

      router.refresh();
    });
  }

  /**
   * Remove the line from the cart.
   */
  function remove() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/cart/items/${line.batchId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The item could not be removed.");
        return;
      }

      router.refresh();
    });
  }

  const atMax = line.qty >= line.availableQty;

  return (
    <article
      className={`rounded-card border bg-white/70 p-4 shadow-soft backdrop-blur-md transition ${
        line.available
          ? "border-white/40"
          : "border-expired-500/30 bg-expired-50/40"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {/* ── Line identity ───────────────────────────────────────── */}
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-sand-900">
              {line.productName}
            </h3>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${presentation.badgeClass}`}
            >
              {presentation.label}
            </span>
          </div>

          <p className="mt-1 font-mono text-xs text-sand-400">{line.batchCode}</p>

          {line.originDistrict ? (
            <p className="mt-1 text-xs text-sand-500">
              Harvested from {line.originDistrict}
            </p>
          ) : null}

          {!line.available ? (
            <p className="mt-2 text-sm font-medium text-expired-700">
              {line.unavailableReason}
            </p>
          ) : null}
        </div>

        {/* ── Line total ─────────────────────────────────────────── */}
        {/* The total drops under the product name on a phone rather than
            competing with it for the same row. */}
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-lg font-semibold tracking-tight text-sand-900">
            {formatBDT(line.lineTotal)}
          </p>
          <p className="text-xs text-sand-500">
            {formatBDT(line.unitPrice)} / {formatUnit(line.unit)}
          </p>
        </div>
      </div>

      {/* ── Quantity controls ─────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-3">
        {/* The quantity label, the stepper and the remaining-stock note
            wrap onto separate lines rather than overflowing at 320 px. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-xs text-sand-500">
            {formatQty(line.qty)} {formatUnit(line.unit)}
          </span>

          <div className="ml-1 inline-flex items-center rounded-lg border border-sand-200 bg-white">
            <button
              type="button"
              onClick={() => changeQty(Math.max(0, line.qty - 1))}
              disabled={isPending || line.qty <= 1}
              aria-label={`Decrease the quantity of ${line.productName}`}
              className="flex size-8 items-center justify-center rounded-l-lg text-sand-600 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:text-sand-300"
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>

            <span className="min-w-12 border-x border-sand-200 px-2 text-center text-sm font-medium tabular-nums text-sand-900">
              {formatQty(line.qty)}
            </span>

            <button
              type="button"
              onClick={() => changeQty(line.qty + 1)}
              disabled={isPending || atMax}
              aria-label={`Increase the quantity of ${line.productName}`}
              className="flex size-8 items-center justify-center rounded-r-lg text-sand-600 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:text-sand-300"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {line.available ? (
            <span className="text-xs text-sand-400">
              {formatQty(line.availableQty)} {formatUnit(line.unit)} left
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-sand-500 transition hover:bg-expired-50 hover:text-expired-700 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Remove
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-expired-700">
          {error}
        </p>
      ) : null}
    </article>
  );
}
