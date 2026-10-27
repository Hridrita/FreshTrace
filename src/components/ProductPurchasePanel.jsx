"use client";

import { useState } from "react";
import AddToCartButton from "@/components/AddToCartButton";
import BatchSelector from "@/components/BatchSelector";

/**
 * ProductPurchasePanel — the batch picker and the add-to-basket button.
 *
 * The two controls have to live in the same client tree: the picker decides
 * *which* batch is added, and the button adds it. Everything else on the
 * product detail page stays a Server Component.
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.batches
 * @param {string} props.unit the product's unit of sale
 * @param {boolean} props.isSignedIn
 */
export default function ProductPurchasePanel({ batches, unit, isSignedIn }) {
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id ?? null);

  return (
    <>
      {batches.length > 0 ? (
        <BatchSelector
          batches={batches}
          unit={unit}
          onSelect={setSelectedBatchId}
        />
      ) : null}

      <AddToCartButton
        batchId={selectedBatchId}
        isSignedIn={isSignedIn}
        disabled={batches.length === 0 || selectedBatchId === null}
      />
    </>
  );
}
