import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  PackageCheck,
  QrCode,
  ShieldCheck,
} from "lucide-react";

/**
 * Hero — the landing page's opening section.
 *
 * The headline makes the promise the rest of the product keeps: you can see
 * where your food came from and how fresh it is. The subtext names the
 * mechanism (harvest date, freshness tier, batch code) so the claim is
 * concrete rather than marketing fluff.
 *
 * ## Responsive behaviour
 *
 * Two columns from `lg` up, stacked below. The visual panel moves *below* the
 * copy on a phone because the copy is what the visitor came for — the
 * decorative panel should never push the headline off-screen.
 *
 * The CTAs are full-width on a phone (`w-full sm:w-auto`) so they are easy
 * to hit, and inline from `sm` up.
 *
 * The visual is a **mock trace card** rather than a photograph: the repo
 * carries no imagery, and a fabricated photo would be a lie the product can't
 * back up. It shows a real batch's fields — harvest date, district, tier,
 * batch code — which is exactly what a shopper sees in the app.
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* ── Ambient background ───────────────────────────────────────────
          Decorative only. `overflow-x-clip` on the wrapper trims these
          blobs without creating a scroll container. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 h-[36rem] bg-gradient-to-b from-brand-50/80 via-brand-50/20 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-32 top-24 size-96 rounded-full bg-brand-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-32 top-40 size-[28rem] rounded-full bg-fresh-100/60 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ── Copy column ────────────────────────────────────────────── */}
          <div className="min-w-0">
            {/* ── Eyebrow ─────────────────────────────────────────────── */}
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-medium text-brand-800 shadow-soft backdrop-blur-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-fresh-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-fresh-500" />
              </span>
              Live traceability, Dhaka
            </span>

            {/* ── Headline ────────────────────────────────────────────── */}
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-sand-900 sm:text-5xl lg:text-6xl">
              Know exactly{" "}
              <span className="relative whitespace-nowrap text-brand-700">
                when it was
                <svg
                  className="absolute -bottom-1 left-0 h-3 w-full text-brand-300"
                  viewBox="0 0 200 12"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8c40-6 80-8 120-6 20 1 40 3 76 1"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              picked.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-sand-600 sm:text-lg">
              FreshTrace connects farmers to your table with an unbroken chain
              of custody. Every batch carries its harvest date, its origin
              district and a tamper-proof log — so the price you pay always
              matches how fresh the produce actually is.
            </p>

            {/* ── CTAs ─────────────────────────────────────────────────── */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/app/products"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lifted transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto"
              >
                Explore Catalog
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>

              <Link
                href="/app/products"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-sand-300 bg-white/80 px-6 py-3.5 text-sm font-semibold text-sand-800 shadow-soft backdrop-blur-sm transition hover:border-brand-300 hover:bg-white hover:text-brand-800 sm:w-auto"
              >
                <QrCode className="size-4" aria-hidden="true" />
                Track a Product
              </Link>

              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 px-2 py-3.5 text-sm font-semibold text-sand-600 transition hover:text-brand-700 sm:w-auto sm:px-3"
              >
                Sign In / Get Started
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            {/* ── Trust strip ─────────────────────────────────────────── */}
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-sand-600">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                QC inspected at intake
              </li>
              <li className="flex items-center gap-2">
                <CalendarCheck className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                Harvest date on every batch
              </li>
              <li className="flex items-center gap-2">
                <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                Direct from aggregators
              </li>
            </ul>
          </div>

          {/* ── Visual column ───────────────────────────────────────────── */}
          <div className="min-w-0 lg:pl-4">
            <TraceCard />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The hero's visual: a mock batch-trace card.
 *
 * It mirrors the fields the app genuinely records — the freshness tier, the
 * harvest date, the origin district, the batch code and the QC grade — so
 * the promise in the headline is shown, not just claimed.
 */
function TraceCard() {
  return (
    <div className="relative">
      {/* A soft glow behind the card so it lifts off the background. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 translate-y-4 rounded-[2rem] bg-brand-200/30 blur-2xl"
        aria-hidden="true"
      />

      <div className="rounded-[1.75rem] border border-sand-200 bg-white/90 p-5 shadow-float backdrop-blur-md sm:p-7">
        {/* ── Card header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-sand-400">
              Batch trace
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-sand-900">
              Thai Mango
            </h2>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fresh-50 px-2.5 py-1 text-xs font-medium text-fresh-800 ring-1 ring-inset ring-fresh-600/20">
            <span className="size-2 rounded-full bg-fresh-500" aria-hidden="true" />
            Fresh
          </span>
        </div>

        {/* ── Trace timeline ─────────────────────────────────────────── */}
        <ol className="mt-6 space-y-4">
          <TraceStep
            icon={CalendarCheck}
            title="Harvested"
            value="9 Oct 2026"
            note="Rajshahi district"
          />
          <TraceStep
            icon={PackageCheck}
            title="QC inspected"
            value="Grade A"
            note="10 Oct, 07:20"
          />
          <TraceStep
            icon={QrCode}
            title="Logged at hub"
            value="FT-MNG-2026-10-09-A1"
            note="Sealed & listed"
          />
        </ol>

        {/* ── Footer of the card ─────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sand-50 px-4 py-3">
          <span className="text-xs text-sand-500">Priced by freshness tier</span>
          <span className="text-sm font-semibold tracking-tight text-sand-900">
            ৳ 120 / kg
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * One row of the trace timeline.
 *
 * The connector line between steps is drawn with a pseudo-element so the
 * list stays semantic markup — an ordered list — rather than nested divs.
 *
 * @param {object} props
 * @param {import("lucide-react").LucideIcon} props.icon
 * @param {string} props.title
 * @param {string} props.value
 * @param {string} props.note
 * @param {boolean} [props.last]
 */
function TraceStep({ icon: Icon, title, value, note, last = false }) {
  return (
    <li className="relative flex items-start gap-3.5">
      {/* The icon chip. `after` draws the connector to the next step. */}
      <span
        className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 ${
          last
            ? ""
            : "after:absolute after:left-1/2 after:top-full after:h-6 after:w-px after:-translate-x-1/2 after:bg-sand-200"
        }`}
      >
        <Icon className="size-4.5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-sand-400">
          {title}
        </p>
        <p className="mt-0.5 break-words text-sm font-semibold text-sand-900">
          {value}
        </p>
        <p className="mt-0.5 break-words text-xs text-sand-500">{note}</p>
      </div>
    </li>
  );
}
