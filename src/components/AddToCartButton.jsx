"use client";

import { Check, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * AddToCartButton — adds a batch to the signed-in customer's cart.
 *
 * A Client Component because adding to the cart is an interaction. The
 * button is disabled while the request is in flight so a double click
 * cannot add the batch twice.
 *
 * A signed-out visitor is sent to the login screen instead — the cart
 * belongs to an account, so there is nowhere to put the item.
 *
 * @param {object} props
 * @param {string} props.batchId
 * @param {boolean} props.isSignedIn
 * @param {boolean} [props.disabled] the batch is not buyable
 */
export default function AddToCartButton({ batchId, isSignedIn, disabled = false }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState(null);

  function add() {
    setError(null);
    setAdded(false);

    startTransition(async () => {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, qty: 1 }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The item could not be added to your cart.");
        return;
      }

      setAdded(true);
      router.refresh();
    });
  }

  if (!isSignedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent("/app/cart")}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        <ShoppingBasket className="size-4" aria-hidden="true" />
        Sign in to add to basket
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={add}
        disabled={disabled || isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-400"
      >
        {added ? (
          <>
            <Check className="size-4" aria-hidden="true" />
            Added to basket
          </>
        ) : (
          <>
            <ShoppingBasket className="size-4" aria-hidden="true" />
            {disabled ? "Out of stock" : isPending ? "Adding…" : "Add to basket"}
          </>
        )}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-expired-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
