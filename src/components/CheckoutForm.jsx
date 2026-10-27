"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import AddressQuickForm from "@/components/AddressQuickForm";
import SuccessToast from "@/components/SuccessToast";
import { PAYMENT_METHODS } from "@/lib/constants";

/**
 * CheckoutForm — chooses an address and places the order.
 *
 * Two things can happen here, and the form handles both without the
 * customer being blocked:
 *
 * 1. **The customer has a saved address.** It is preselected and the order
 *    can be placed straight away.
 * 2. **The customer has none.** An inline address form is shown instead.
 *    Submitting it saves the address and selects it, after which the order
 *    can be placed.
 *
 * The order itself is placed by posting the cart's lines to `/api/orders`.
 * The service reserves the stock atomically, so the customer either gets a
 * complete order or a clear "something just sold out" message and nothing
 * is reserved at all. The order is created against the signed-in customer,
 * the cart's lines are removed from the cart by the same request, and the
 * customer is redirected to their order history.
 *
 * The mock Stripe checkout is a later story — this covers order placement
 * only, so the order lands in `pending_payment`.
 *
 * @param {object} props
 * @param {Array<{ batchId: string, qty: number, productName: string, lineTotal: number }>} props.items
 * @param {Array<import("@prisma/client").Address>} props.addresses
 * @param {string} props.subtotal the formatted subtotal
 * @param {string} props.deliveryFee the formatted delivery fee
 * @param {string} props.grandTotal the formatted grand total
 */
export default function CheckoutForm({
  items,
  addresses,
  subtotal,
  deliveryFee,
  grandTotal,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingAddress, startAddressTransition] = useTransition();
  const [error, setError] = useState(null);
  const [addressError, setAddressError] = useState(null);
  const [toast, setToast] = useState(null);

  /**
   * The addresses the customer can choose from. It starts as the saved
   * addresses and grows by one when the quick-form saves a new one, so the
   * newly saved address is immediately selected.
   */
  const [addressOptions, setAddressOptions] = useState(addresses);
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);

  // The toast dismisses itself after a few seconds. The timer is cleared on
  // unmount so it cannot fire against an unmounted component.
  const toastTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /**
   * Show the success toast and start its dismissal timer.
   *
   * @param {string} title
   * @param {string} message
   */
  function showToast(title, message) {
    setToast({ title, message });

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  /**
   * Save an address entered in the quick-form and select it.
   *
   * @param {object} values
   */
  function saveAddress(values) {
    setAddressError(null);

    startAddressTransition(async () => {
      const response = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setAddressError(
          body?.error?.message ?? "The address could not be saved.",
        );
        return;
      }

      const body = await response.json();
      const saved = body.data;

      // The new address joins the list and is selected straight away, so the
      // customer can place the order without a second click.
      setAddressOptions((current) => [...current, saved]);
      setAddressId(saved.id);
    });
  }

  /**
   * Place the order.
   */
  function placeOrder() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({ batchId: item.batchId, qty: item.qty })),
          addressId,
          paymentMethod,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The order could not be placed.");
        return;
      }

      const body = await response.json();

      // The toast is shown before the navigation so the confirmation is
      // visible on the orders page rather than being torn down with the
      // checkout.
      showToast(
        "Order placed",
        `${body.data.orderCode} is confirmed. We will call before delivery.`,
      );

      router.push("/app/orders");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sand-300 bg-sand-50 px-4 py-3 text-sm text-sand-600">
        Your cart is empty.
      </p>
    );
  }

  const hasSavedAddress = addressOptions.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Delivery address ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-sand-500">
          Deliver to
        </h2>

        {hasSavedAddress ? (
          <>
            <div className="mt-2 space-y-2">
              {addressOptions.map((address) => {
                const isSelected = address.id === addressId;

                return (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                      isSelected
                        ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500/30"
                        : "border-sand-200 bg-white hover:border-sand-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="addressId"
                      value={address.id}
                      checked={isSelected}
                      onChange={() => setAddressId(address.id)}
                      className="mt-1 size-4 accent-brand-600"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-sand-900">
                        {address.label}
                        {address.isDefault ? (
                          <span className="ml-2 text-xs font-normal text-sand-500">
                            (default)
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sand-600">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}, {address.area},{" "}
                        {address.city}
                      </span>
                      {address.deliveryNotes ? (
                        <span className="mt-0.5 block text-xs text-sand-500">
                          {address.deliveryNotes}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* The customer can still add another address without leaving
                the checkout — useful when an order is going to a friend. */}
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-brand-700 transition hover:text-brand-800">
                <span className="group-open:hidden">+ Deliver somewhere else</span>
                <span className="hidden group-open:inline">
                  − Use a different address
                </span>
              </summary>

              <div className="mt-3 rounded-lg border border-sand-200 bg-sand-50/60 p-3">
                <AddressQuickForm
                  onSubmit={saveAddress}
                  isPending={isSavingAddress}
                  error={addressError}
                />
              </div>
            </details>
          </>
        ) : (
          /* No saved address: the quick-form stands in for the list, so the
             customer is never blocked. */
          <div className="mt-2">
            <AddressQuickForm
              onSubmit={saveAddress}
              isPending={isSavingAddress}
              error={addressError}
            />
          </div>
        )}
      </section>

      {/* ── Payment method ────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-sand-500">
          Payment method
        </legend>

        <div className="mt-2 space-y-2">
          {PAYMENT_METHODS.map((method) => {
            const isSelected = method === paymentMethod;

            return (
              <label
                key={method}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition ${
                  isSelected
                    ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500/30"
                    : "border-sand-200 bg-white hover:border-sand-300"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method}
                    checked={isSelected}
                    onChange={() => setPaymentMethod(method)}
                    className="size-4 accent-brand-600"
                  />
                  <span className="text-sm font-medium text-sand-900">
                    {PAYMENT_METHOD_LABELS[method].label}
                  </span>
                </span>
                <span className="text-xs text-sand-500">
                  {PAYMENT_METHOD_LABELS[method].note}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── Totals ─────────────────────────────────────────────────── */}
      <dl className="space-y-2.5 border-t border-sand-200 pt-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sand-600">Subtotal</dt>
          <dd className="font-medium text-sand-900">{subtotal}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sand-600">Delivery</dt>
          <dd className="font-medium text-sand-900">{deliveryFee}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-sand-200 pt-2.5 text-base">
          <dt className="font-semibold text-sand-900">Total</dt>
          <dd className="font-semibold tracking-tight text-sand-900">
            {grandTotal}
          </dd>
        </div>
      </dl>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-expired-500/30 bg-expired-50 px-4 py-3 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      {/* The button is only enabled once there is somewhere to deliver to. */}
      <button
        type="button"
        onClick={placeOrder}
        disabled={isPending || !addressId}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-400"
      >
        {isPending
          ? "Placing your order…"
          : addressId
            ? "Place order"
            : "Add a delivery address to continue"}
      </button>

      {toast ? (
        <SuccessToast
          title={toast.title}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The presentation of each payment method.
 *
 * The permitted values live in `PAYMENT_METHODS` (the app-level allowlist);
 * this map only supplies the label and the note the customer reads.
 */
const PAYMENT_METHOD_LABELS = {
  cash_on_delivery: { label: "Cash on delivery", note: "Pay the rider" },
  card: { label: "Card", note: "Visa, Mastercard" },
  bkash: { label: "bKash", note: "Mobile wallet" },
  nagad: { label: "Nagad", note: "Mobile wallet" },
};
