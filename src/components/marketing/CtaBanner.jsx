import { ArrowRight, Leaf, ShoppingBasket, UserPlus } from "lucide-react";
import { FadeIn, PressableLink, Stagger, StaggerItem } from "./animation";

/**
 * CTA Banner — the closing call to action.
 *
 * Sits directly above the root footer, so it is the last thing a visitor
 * reads before they leave. It offers the three next steps that actually
 * exist in the app: browse the catalogue, open an account, or sign in.
 *
 * ## Responsive behaviour
 *
 * The copy and the buttons stack on a phone and sit side by side from `lg`.
 * The buttons are full-width on a phone (`w-full sm:w-auto`) so they are
 * comfortable to tap, and inline from `sm` up.
 *
 * ## Motion
 *
 * The banner rises into view as it is reached, the three actions arrive one
 * after another, and each button lifts on hover and depresses on tap.
 */
export default function CtaBanner() {
  return (
    <section className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeIn y={36}>
          <div className="relative overflow-hidden rounded-[1.75rem] bg-brand-700 px-6 py-14 shadow-float sm:px-12 sm:py-16 lg:px-16 lg:py-20">
            {/* ── Ambient decoration ───────────────────────────────────────
                Decorative blobs behind the copy. `overflow-hidden` on the
                banner trims them without creating a scroll container. */}
            <div
              className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-brand-400/30 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-fresh-400/20 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute right-10 top-1/2 size-40 -translate-y-1/2 rounded-full bg-white/5 blur-2xl"
              aria-hidden="true"
            />

            <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
              {/* ── Copy ──────────────────────────────────────────────────── */}
              <div className="min-w-0">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-50 backdrop-blur-sm">
                  <Leaf className="size-3.5" aria-hidden="true" />
                  Today&apos;s batches are live
                </span>

                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  See exactly what&apos;s fresh today
                </h2>

                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-50/90">
                  Browse the live catalogue to see today&apos;s harvest, its
                  freshness tier and its price — all before you commit to a
                  single order.
                </p>

                <Stagger className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" stagger={0.1}>
                  <StaggerItem index={0}>
                    <PressableLink
                      href="/app/products"
                      className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-brand-800 shadow-lifted transition hover:bg-brand-50"
                    >
                      <ShoppingBasket className="size-4" aria-hidden="true" />
                      Explore the catalogue
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </PressableLink>
                  </StaggerItem>

                  <StaggerItem index={1}>
                    <PressableLink
                      href="/register"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                    >
                      <UserPlus className="size-4" aria-hidden="true" />
                      Create an account
                    </PressableLink>
                  </StaggerItem>

                  <StaggerItem index={2}>
                    <PressableLink
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 px-2 py-3.5 text-sm font-semibold text-brand-50 transition hover:text-white sm:px-3"
                    >
                      Sign in
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </PressableLink>
                  </StaggerItem>
                </Stagger>
              </div>

              {/* ── Social proof card ─────────────────────────────────────── */}
              <FadeIn delay={0.18}>
                <div className="min-w-0">
                  <div className="rounded-card border border-white/15 bg-white/10 p-6 backdrop-blur-md">
                    <p className="text-xs font-medium uppercase tracking-wider text-brand-100">
                      Why people switch
                    </p>

                    <Stagger as="ul" className="mt-5 space-y-4" stagger={0.08} delay={0.1}>
                      {[
                        "No more guessing how old the produce is",
                        "One price per freshness tier — no surprises",
                        "Weekly baskets on a schedule that suits you",
                        "Direct trade that pays the grower more",
                      ].map((point, index) => (
                        <StaggerItem
                          key={point}
                          index={index}
                          as="li"
                          className="flex items-start gap-3"
                        >
                          <span
                            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20"
                            aria-hidden="true"
                          >
                            <Leaf className="size-3 text-brand-50" />
                          </span>
                          <span className="min-w-0 text-sm leading-relaxed text-brand-50/95">
                            {point}
                          </span>
                        </StaggerItem>
                      ))}
                    </Stagger>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
