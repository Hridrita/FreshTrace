"use client";

import { useState } from "react";
import { formatBDT, formatQty, formatUnit, getTierPresentation } from "@/lib/freshness";

/**
 * BatchSelector — picks which batch of a product goes into the cart.
 *
 * A product can have several batches in stock at once, each with its own
 * harvest date, freshness tier and price. The customer picks the lot they
 * want; the picked batch is what gets added to the cart.
 *
 * The selection is local state — the parent reads it back through the
 * `onSelect` callback.
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.batches
 * @param {string} props.unit the product's unit of sale
 * @param {(batchId: string) => void} props.onSelect
 */
export default function BatchSelector({ batches, unit, onSelect }) {
  const [selectedId, setSelectedId] = useState(batches[0]?.id ?? null);

  if (batches.length === 0) {
    return null;
  }

  /**
   * @param {string} batchId
   */
  function select(batchId) {
    setSelectedId(batchId);
    onSelect(batchId);
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-sand-500">
        Choose a batch
      </p>

      <div
        className="mt-2 space-y-2"
        role="radiogroup"
        aria-label="Choose a batch"
      >
        {batches.map((batch) => {
          const presentation = getTierPresentation(batch.tier);
          const isSelected = batch.id === selectedId;

          return (
            <button
              key={batch.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => select(batch.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                isSelected
                  ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500/30"
                  : "border-sand-200 bg-white hover:border-sand-300"
              }`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${presentation.badgeClass}`}
                  >
                    {presentation.label}
                  </span>
                  <span className="truncate text-sm font-medium text-sand-800">
                    {formatQty(batch.availableQty)} {formatUnit(unit)} left
                  </span>
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-sand-400">
                  {batch.batchCode}
                </span>
              </span>

              <span className="shrink-0 text-sm font-semibold text-sand-900">
                {formatBDT(batch.unitPrice)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
