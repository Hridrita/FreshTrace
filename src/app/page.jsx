import LandingPage from "@/components/marketing/LandingPage";

/**
 * Root route — the FreshTrace landing page.
 *
 * This used to redirect into the customer catalogue. The landing page now
 * serves as the front door: it explains the product, and every CTA on it
 * points at a route that already exists (`/app/products`, `/login`,
 * `/register`).
 *
 * The catalogue itself is unchanged and still lives at `/app/products`; the
 * customer shell's own home (`(customer)/app/page.jsx`) continues to forward
 * there too, so nothing that used to reach the catalogue is now stranded.
 *
 * The page is a Server Component — it reads no session, no cart and no
 * database, so the marketing page stays static and fast.
 */
export const metadata = {
  title: "FreshTrace — Farm-to-Table Freshness You Can Verify",
  description:
    "Trace every batch from harvest to your door. FreshTrace shows the harvest date, QC grade and freshness tier of every piece of produce, so the price always matches how fresh it really is.",
  openGraph: {
    title: "FreshTrace — Farm-to-Table Freshness You Can Verify",
    description:
      "End-to-end traceability, QC-inspected batches and honest freshness pricing for produce delivered across Dhaka.",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
