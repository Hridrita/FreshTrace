import { CheckCircle2, Clock, FileCheck2, QrCode, Scale, Thermometer } from "lucide-react";
import { FadeIn, Pressable, Stagger, StaggerItem } from "./animation";

/**
 * Stats — the transparency and reliability showcase.
 *
 * These figures are **capabilities of the system**, not vanity metrics read
 * from a counter. Nothing here queries the database, which keeps the landing
 * page fast, static-friendly and truthful — each number describes something
 * the product structurally guarantees.
 *
 * The companion panel shows the five freshness tiers the decay engine
 * assigns, because that scale is the heart of the pricing model and a
 * shopper who understands it understands why two batches of the same mango
 * cost different amounts.
 *
 * ## Responsive behaviour
 *
 * Two columns on a phone and tablet, four from `lg`. The tier panel sits
 * below the stat grid and goes full width, with the tier list switching from
 * one column to two from `sm`.
 *
 * ## Motion
 *
 * The four statistics count in one after another as the dark section scrolls
 * into view, which gives the numbers a rhythm rather than having them all
 * land at once.
 */
const STATS = [
  {
    value: "100%",
    label: "Batches inspected",
    body: "Nothing reaches the catalogue without a QC record.",
    icon: FileCheck2,
  },
  {
    value: "5",
    label: "Freshness tiers",
    body: "From just-picked to near-expiry, priced honestly.",
    icon: Scale,
  },
  {
    value: "< 24h",
    label: "Hub to listing",
    body: "Produce is graded and live within a day of arrival.",
    icon: Clock,
  },
  {
    value: "SHA-256",
    label: "Tamper-proof sessions",
    body: "Credentials are stored as hashes, never as plain text.",
    icon: QrCode,
  },
];

/**
 * The freshness tier scale, mirroring `TIER_PRESENTATION` in
 * `src/lib/freshness.js`.
 */
const TIERS = [
  { label: "Fresh", range: "Day 0", className: "bg-fresh-500" },
  { label: "Good", range: "Days 1–2", className: "bg-good-500" },
  { label: "Fair", range: "Days 3–4", className: "bg-fair-500" },
  { label: "Near expiry", range: "Final days", className: "bg-near-expiry-500" },
  { label: "Expired", range: "Delisted", className: "bg-expired-500" },
];

export default function Stats() {
  return (
    <section id="trust" className="scroll-mt-20 bg-sand-900 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section heading ─────────────────────────────────────────── */}
        <FadeIn className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Built on proof
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Every claim backed by a record
          </h2>
          <p className="mt-4 text-base leading-relaxed text-sand-300">
            Freshness isn&apos;t a claim you take on trust. It&apos;s a date, a
            grade and a temperature reading — stored with every batch and
            visible before you buy.
          </p>
        </FadeIn>

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <Stagger
          className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5"
          stagger={0.1}
        >
          {STATS.map((stat, index) => (
            <StaggerItem key={stat.label} index={index} className="h-full">
              <Pressable className="h-full">
                <StatCard {...stat} />
              </Pressable>
            </StaggerItem>
          ))}
        </Stagger>

        {/* ── Tier showcase ────────────────────────────────────────────── */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
          {/* The tier scale. */}
          <FadeIn>
            <div className="h-full rounded-card border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                  <Scale className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-white">
                  The freshness scale
                </h3>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-sand-300">
                Days since harvest determine a tier, and the tier determines the
                price. You see the tier and the arithmetic before you pay.
              </p>

              {/*
                One column on a phone, two from `sm`. The last item spans
                both columns so the five-tier scale reads as a complete
                ladder rather than leaving a gap where the sixth cell
                would be.
              */}
              <Stagger as="ul" className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2" stagger={0.06}>
                {TIERS.map((tier, index) => (
                  <StaggerItem
                    key={tier.label}
                    index={index}
                    as="li"
                    className={`flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 ${
                      index === TIERS.length - 1 ? "sm:col-span-2" : ""
                    }`}
                  >
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${tier.className}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                      {tier.label}
                    </span>
                    <span className="shrink-0 text-xs text-sand-400">
                      {tier.range}
                    </span>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </FadeIn>

          {/* The checklist. */}
          <FadeIn delay={0.1}>
            <div className="h-full rounded-card border border-white/10 bg-gradient-to-br from-brand-700/40 to-white/5 p-6 backdrop-blur-sm sm:p-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                  <Thermometer className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-white">
                  What a batch record holds
                </h3>
              </div>

              <Stagger as="ul" className="mt-6 space-y-3.5" stagger={0.06} delay={0.1}>
                {[
                  "Harvest date and origin district",
                  "QC grade, weight and temperature",
                  "Unique batch code and QR slug",
                  "Supplying aggregator and receiving time",
                  "Tier, price multiplier and expiry date",
                  "Append-only inspection history",
                ].map((item, index) => (
                  <StaggerItem
                    key={item}
                    index={index}
                    as="li"
                    className="flex items-start gap-2.5"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-brand-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 text-sm leading-relaxed text-sand-200">
                      {item}
                    </span>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/**
 * A single stat card.
 *
 * The value uses `text-2xl sm:text-3xl` so the longer values (like
 * `SHA-256`) stay inside a half-width phone column without overflowing.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {string} props.label
 * @param {string} props.body
 * @param {import("lucide-react").LucideIcon} props.icon
 */
function StatCard({ value, label, body, icon: Icon }) {
  return (
    <div className="flex h-full flex-col rounded-card border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10 sm:p-6">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>

      <p className="mt-4 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-brand-300">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-sand-400">{body}</p>
    </div>
  );
}
