"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, MapPin } from "lucide-react";
import AddressForm from "@/components/AddressForm";
import { formatBDT, formatQty } from "@/lib/freshness";

/**
 * SubscriptionSetupForm — choose a plan, a delivery address and a weekday.
 *
 * This is the setup half of the subscriptions page: the customer picks one
 * of the available plans, where the basket should go, and which weekday the
 * weekly delivery should land on. The subscription is created through a
 * Server Action, so the page re-renders with the new subscription and the
 * plan list is replaced by the active-plan view.
 *
 * The plan's weekly price is the *fresh-tier* price — a ceiling. Each
 * delivery is priced at the actual freshness tier of the produce on the day
 * it is picked, so the real charge may come out lower. The copy says so
 * rather than quoting a fixed amount.
 *
 * @param {object} props
 * @param {Array<{ id: string, name: string, basketSize: string, weeklyPrice: number, description: string | null, composition: string }>} props.plans
 * @param {Array<{ id: string, label: string, line1: string, area: string, city: string, isDefault: boolean }>} props.addresses
 * @param {Array<{ id: string, name: string, unit: string }>} props.products the products in the catalogue, for the basket preview
 */
export default function SubscriptionSetupForm({ plans, addresses, products = [] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [addressId, setAddressId] = useState(
    addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id ?? "",
  );
  const [dayOfWeek, setDayOfWeek] = useState(5); // Friday

  // The address the customer saves inline, once they have saved one.
  const [savedAddresses, setSavedAddresses] = useState(addresses);
  const [addressError, setAddressError] = useState(null);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(addresses.length === 0);

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;
  const composition = parseComposition(selectedPlan?.composition);

  /**
   * Save a delivery address inline.
   *
   * A customer who has never saved an address would otherwise be stuck: the
   * subscription needs somewhere to deliver, and the basket cannot be set up
   * without one. Saving it here keeps the whole setup on one page — the new
   * address is selected the moment it is saved, which enables the basket
   * button straight away.
   *
   * @param {object} values
   */
  function saveAddress(values) {
    setAddressError(null);
    setIsSavingAddress(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setAddressError(body?.error?.message ?? "The address could not be saved.");
          return;
        }

        const body = await response.json();
        const saved = body.data;

        setSavedAddresses((current) => [...current, saved]);
        setAddressId(saved.id);
        setIsAddingAddress(false);
      } finally {
        setIsSavingAddress(false);
      }
    });
  }

  /**
   * Subscribe.
   */
  function subscribe() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, addressId, dayOfWeek }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The subscription could not be created.");
        return;
      }

      // The subscription is created — re-render the server components so the
      // page swaps the plans for the active-plan view.
      router.refresh();
    });
  }

  if (plans.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-sand-300 bg-white px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-sand-900">
          No subscription plans available
        </h2>
        <p className="mt-1.5 text-sm text-sand-600">
          Weekly baskets are being prepared. Please check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Plan choice ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-sand-500">
          Choose a weekly basket
        </h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = plan.id === planId;

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanId(plan.id)}
                aria-pressed={isSelected}
                className={`flex flex-col rounded-card border p-4 text-left transition ${
                  isSelected
                    ? "border-brand-500 bg-brand-50/70 shadow-soft ring-1 ring-brand-500/30"
                    : "border-sand-200 bg-white hover:border-sand-300"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-sand-900">
                    {plan.name}
                  </span>

                  {isSelected ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>

                <span className="mt-1 text-xs capitalize text-sand-500">
                  {plan.basketSize} basket
                </span>

                <span className="mt-3 text-2xl font-semibold tracking-tight text-sand-900">
                  {formatBDT(plan.weeklyPrice)}
                </span>
                <span className="text-xs text-sand-500">per week</span>

                {plan.description ? (
                  <span className="mt-3 text-sm leading-relaxed text-sand-600">
                    {plan.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Basket preview ───────────────────────────────────────── */}
      {composition.length > 0 ? (
        <div className="rounded-card border border-white/40 bg-white/70 p-5 shadow-soft backdrop-blur-md">
          <h3 className="text-sm font-semibold text-sand-900">
            What&apos;s in this basket
          </h3>

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

          <p className="mt-4 border-t border-sand-100 pt-3 text-xs leading-relaxed text-sand-500">
            The weekly price is the fresh-produce price and acts as a ceiling.
            Each delivery is charged at the actual freshness tier of what is
            picked that day, so your bill may come out lower.
          </p>
        </div>
      ) : null}

      {/* ── Address and delivery day ─────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-sand-600">
            Deliver to
          </span>

          {savedAddresses.length === 0 ? (
            <p className="mt-1 rounded-lg border border-dashed border-sand-300 bg-sand-50 px-3 py-2.5 text-sm text-sand-600">
              You need a saved delivery address before you can subscribe. Add
              one below and the basket button will unlock.
            </p>
          ) : (
            <select
              value={addressId}
              onChange={(event) => setAddressId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            >
              {savedAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.line1}, {address.area}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-sand-600">
            Delivery day
          </span>

          <select
            value={dayOfWeek}
            onChange={(event) => setDayOfWeek(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {WEEKDAYS.map((name, index) => (
              <option key={name} value={index}>
                Every {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Inline address ────────────────────────────────────────────
          A customer with no saved address can type one here. Saving it
          selects it immediately, which is what unlocks the basket
          button below. */}
      {isAddingAddress ? (
        <div className="rounded-card border border-white/40 bg-white/70 p-5 shadow-soft backdrop-blur-md">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-sand-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-sand-900">
              Where should we deliver?
            </h3>
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-sand-600">
            We will save this address so you can reuse it for orders too.
          </p>

          <div className="mt-4">
            <AddressForm
              onSubmit={saveAddress}
              isPending={isSavingAddress}
              error={addressError}
              submitLabel="Save address"
              onCancel={
                savedAddresses.length > 0 ? () => setIsAddingAddress(false) : undefined
              }
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAddressError(null);
            setIsAddingAddress(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3.5 py-2 text-sm font-semibold text-sand-700 transition hover:bg-sand-50"
        >
          <MapPin className="size-4" aria-hidden="true" />
          Deliver somewhere else
        </button>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-expired-500/30 bg-expired-50 px-4 py-3 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={subscribe}
        disabled={isPending || !addressId || !planId}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-400"
      >
        <CalendarDays className="size-4" aria-hidden="true" />
        {isPending
          ? "Setting up your subscription…"
          : `Start the ${selectedPlan?.name ?? "weekly"} basket`}
      </button>
    </div>
  );
}

/**
 * The seven delivery weekdays, as `dayOfWeek` values (0 = Sunday).
 */
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Parse a plan's composition into a structured list.
 *
 * @param {string | null | undefined} composition
 * @returns {Array<{ productId: string, defaultQty: number }>}
 */
function parseComposition(composition) {
  if (!composition) return [];

  try {
    const parsed = JSON.parse(composition);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.productId === "string" &&
        Number.isFinite(item.defaultQty),
    );
  } catch {
    return [];
  }
}
