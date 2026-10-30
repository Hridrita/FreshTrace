import {
  ClipboardCheck,
  PackageCheck,
  ShoppingBasket,
  Sprout,
  Truck,
  Warehouse,
} from "lucide-react";

/**
 * How It Works — the farm-to-consumer workflow.
 *
 * Four steps, each one a real stage in the system's lifecycle:
 *
 * 1. **Harvest** — an aggregator records the lot, its district and its
 *    harvest date when it comes off the plant.
 * 2. **Inspect** — the batch is graded at the hub; a failed lot never
 *    reaches the catalogue.
 * 3. **List & price** — the decay engine assigns a freshness tier and a
 *    price from that tier, and the batch goes live with a QR slug.
 * 4. **Deliver** — you order it, we deliver it, and the batch code stays
 *    attached to the order for traceability.
 *
 * ## Responsive behaviour
 *
 * A vertical timeline on a phone (the connector runs down the left edge)
 * that becomes a four-column horizontal track from `lg`. The connector is
 * drawn with a `before` pseudo-element rather than an extra element, so the
 * markup stays a plain ordered list.
 */
const STEPS = [
  {
    icon: Sprout,
    title: "Harvested",
    body: "The lot is recorded at source with its district, harvest date and the aggregator who supplied it.",
    meta: "Origin logged",
  },
  {
    icon: ClipboardCheck,
    title: "Inspected",
    body: "Our team grades the batch at the hub, checking weight, condition and temperature before anything is listed.",
    meta: "QC grade recorded",
  },
  {
    icon: PackageCheck,
    title: "Priced & listed",
    body: "The decay engine reads the days since harvest, assigns a freshness tier and prices the batch accordingly.",
    meta: "Tier + QR slug assigned",
  },
  {
    icon: Truck,
    title: "Delivered",
    body: "You see exactly which batch is coming, it arrives at your door, and the code stays on your order record.",
    meta: "Traceable to your door",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 bg-white py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section heading ─────────────────────────────────────────── */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-sand-900 sm:text-4xl">
            From the field to your front door
          </h2>
          <p className="mt-4 text-base leading-relaxed text-sand-600">
            Four checkpoints, each one recorded. Nothing enters the catalogue
            without passing through them.
          </p>
        </div>

        {/* ── Steps ────────────────────────────────────────────────────── */}
        <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((step, index) => (
            <StepCard key={step.title} step={step} index={index} />
          ))}
        </ol>

        {/* ── Journey strip ────────────────────────────────────────────── */}
        <div className="mt-12 overflow-hidden rounded-card border border-sand-200 bg-sand-50 p-5 sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-inset ring-sand-200">
                <Warehouse className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sand-900">
                  One hub, one chain of custody
                </p>
                <p className="mt-0.5 text-sm text-sand-600">
                  Everything passes through our Dhaka hub before it reaches you.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-inset ring-sand-200">
              <ShoppingBasket className="size-4 text-brand-700" aria-hidden="true" />
              <span className="text-sm font-medium text-sand-800">
                Delivered across Dhaka
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A single workflow step.
 *
 * The step number sits in a small chip above the icon on desktop so the
 * sequence is obvious at a glance; on mobile the number is part of the
 * connector.
 *
 * @param {object} props
 * @param {{icon: import("lucide-react").LucideIcon, title: string, body: string, meta: string}} props.step
 * @param {number} props.index
 */
function StepCard({ step, index }) {
  const { icon: Icon } = step;

  return (
    <li className="group relative flex gap-4 lg:flex-col lg:gap-0">
      {/* ── Icon ─────────────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 items-center lg:block">
        <span className="relative z-10 flex size-12 items-center justify-center rounded-2xl border border-brand-200 bg-brand-50 text-brand-700 transition group-hover:border-brand-300 group-hover:bg-brand-100 lg:size-14">
          <Icon className="size-6 lg:size-7" aria-hidden="true" />
        </span>

        {/* ── Connector ─────────────────────────────────────────────────
            A hairline running from the right edge of the icon toward the
            next step.

            It is anchored to the **icon**, not to the column: on desktop
            the icon's wrapper is as wide as the whole grid column, so
            `left-full` would have started the line past the *next*
            step's icon instead of at this one's edge. Anchoring to the
            icon span and sizing the line to reach the next icon gives
            a line that actually bridges the gap.

            The gradient fades toward the next step, which reads as
            "continues" rather than "ends here". The final step has no
            connector. */}
        {index === STEPS.length - 1 ? null : (
          <span
            className="absolute left-14 top-1/2 hidden h-px w-[calc(100%-3.5rem)] -translate-y-1/2 bg-gradient-to-r from-sand-200 to-sand-200/30 lg:block"
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── Copy ──────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 pb-2 lg:mt-5 lg:pb-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-sand-400">
          Step {index + 1}
        </span>
        <h3 className="mt-1 text-base font-semibold tracking-tight text-sand-900">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-sand-600">{step.body}</p>

        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100">
          <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
          {step.meta}
        </span>
      </div>
    </li>
  );
}
