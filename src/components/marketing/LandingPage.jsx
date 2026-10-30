import MarketingNav from "@/components/marketing/MarketingNav";
import Hero from "@/components/marketing/Hero";
import Features from "@/components/marketing/Features";
import HowItWorks from "@/components/marketing/HowItWorks";
import Stats from "@/components/marketing/Stats";
import CtaBanner from "@/components/marketing/CtaBanner";

/**
 * LandingPage — the marketing home page.
 *
 * Assembled from the section components in `src/components/marketing/`, so
 * each section stays independently readable and the page file remains a
 * short, obvious map of what the visitor sees.
 *
 * The page is a **Server Component** throughout: no state, no effects and
 * no client-side data fetching. The section anchors it exposes (`#features`,
 * `#how-it-works`, `#trust`) are plain in-page links, which works without
 * JavaScript and keeps the first paint fast.
 *
 * ## Why this page reads the session
 *
 * The landing page is public — anybody can reach it — but it is not
 * *anonymous*. A visitor who is already signed in should see their account
 * links in the navbar rather than a "Sign in" button that would only take
 * them somewhere they already are. `MarketingNav` resolves the session
 * server-side and swaps its action cluster accordingly.
 *
 * The consequence is that the landing page is **dynamic** rather than
 * statically prerendered: Next.js cannot know at build time whether the
 * visitor has a session cookie. That is the same trade-off the customer
 * shell makes, and it is the correct one — the page is served fresh per
 * request, so the navbar always matches the session.
 *
 * The catalogue is untouched and still lives at `/app/products` — this page
 * is a front door to it, not a replacement.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <main id="main" className="overflow-x-clip">
        <Hero />
        <Features />
        <HowItWorks />
        <Stats />
        <CtaBanner />
      </main>
    </div>
  );
}
