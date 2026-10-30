import {
  BadgeCheck,
  Fingerprint,
  Leaf,
  Recycle,
  Route,
  Sprout,
  Thermometer,
} from "lucide-react";

/**
 * Features — the four pillars of the product.
 *
 * Each card names a capability the app actually has, so the section reads as
 * a description of the product rather than a list of aspirations:
 *
 * - **End-to-end traceability** — the `Batch` row records the harvest date,
 *   the origin district, the aggregator and a unique batch code.
 * - **Quality verification** — every batch is inspected at intake and the
 *   result (`BatchQcLog`) keeps the grade, weight, temperature and photos.
 * - **Tamper-proof logs** — session and admin tokens are stored only as
 *   SHA-256 hashes, and QC logs are append-only rows.
 * - **Sustainable sourcing** — near-expiry stock is marked down rather than
 *   thrown away, and the decay engine prices it honestly.
 *
 * ## Responsive behaviour
 *
 * One column on a phone, two from `sm`, four from `lg`. The cards use
 * `flex-col` with `h-full` so the icon, heading and body align across a row
 * regardless of how long the copy runs.
 */
const FEATURES = [
  {
    icon: Route,
    title: "End-to-end traceability",
    body: "Every batch carries its harvest date, origin district, aggregator and a unique batch code — visible to you before you buy, not after.",
    accent: "text-brand-700 bg-brand-50 ring-brand-100",
  },
  {
    icon: BadgeCheck,
    title: "Quality verification",
    body: "Produce is inspected at our hub and graded. The inspection record keeps the grade, weight, temperature and photos for every lot we list.",
    accent: "text-fresh-700 bg-fresh-50 ring-fresh-100",
  },
  {
    icon: Fingerprint,
    title: "Tamper-proof logs",
    body: "Sessions and admin tokens are stored only as SHA-256 hashes, and inspection history is append-only. Nothing in the chain can be quietly rewritten.",
    accent: "text-sand-700 bg-sand-100 ring-sand-200",
  },
  {
    icon: Recycle,
    title: "Sustainable sourcing",
    body: "Stock nearing its shelf life is marked down instead of binned, and the discount is shown honestly so good food gets eaten, not wasted.",
    accent: "text-near-expiry-700 bg-near-expiry-50 ring-near-expiry-100",
  },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-sand-50 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section heading ─────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            Why FreshTrace
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-sand-900 sm:text-4xl">
            Transparency you can actually verify
          </h2>
          <p className="mt-4 text-base leading-relaxed text-sand-600">
            Most marketplaces tell you a product is &ldquo;fresh&rdquo;. We show
            you the date it came off the plant, the inspection it passed and
            the people who handled it.
          </p>
        </div>

        {/* ── Cards ───────────────────────────────────────────────────── */}
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        {/* ── Supporting strip ────────────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MiniFact
            icon={Thermometer}
            title="Cold-chain aware"
            body="Temperature is recorded at inspection, not guessed at."
          />
          <MiniFact
            icon={Leaf}
            title="Direct from source"
            body="Aggregators are paid a wholesale rate, not a consignment fee."
          />
          <MiniFact
            icon={Sprout}
            title="Priced by freshness"
            body="One product, one price per tier — never a hidden markdown."
          />
        </div>
      </div>
    </section>
  );
}

/**
 * A single feature card.
 *
 * `h-full` plus `flex-col` keeps the icon, title and body in a consistent
 * vertical rhythm when the cards sit side by side, and `mt-auto` on the body
 * pushes the copy to the bottom so the row of card bottoms lines up.
 *
 * @param {object} props
 * @param {import("lucide-react").LucideIcon} props.icon
 * @param {string} props.title
 * @param {string} props.body
 * @param {string} props.accent classes for the icon chip
 */
function FeatureCard({ icon: Icon, title, body, accent }) {
  return (
    <article className="flex h-full flex-col rounded-card border border-sand-200 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lifted">
      <span
        className={`flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${accent}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <h3 className="mt-5 text-base font-semibold tracking-tight text-sand-900">
        {title}
      </h3>

      <p className="mt-2.5 text-sm leading-relaxed text-sand-600">{body}</p>
    </article>
  );
}

/**
 * A smaller supporting fact.
 *
 * @param {object} props
 * @param {import("lucide-react").LucideIcon} props.icon
 * @param {string} props.title
 * @param {string} props.body
 */
function MiniFact({ icon: Icon, title, body }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-sand-200 bg-white/70 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-sand-200">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-sand-900">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-sand-600">{body}</p>
      </div>
    </div>
  );
}
