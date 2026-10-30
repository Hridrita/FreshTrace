import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import AddressManager from "@/components/AddressManager";
import { requireCustomerSession } from "@/lib/auth/page-guard";
import { listAddresses } from "@/lib/services/addresses";
import { toAddressViews } from "@/lib/account-view";

/**
 * The customer's delivery addresses, on their own page.
 *
 * SRS §9.1 lists `account/addresses/page.jsx` beside `account/page.jsx`. The
 * account page shows the same list in a summary section; this page is where
 * the customer goes when they want to manage addresses and nothing else.
 *
 * Both pages render the same `AddressManager`, so the add, edit, default and
 * delete behaviour is identical wherever the customer finds it.
 */
export const metadata = {
  title: "Delivery addresses — FreshTrace",
  description: "Add, edit and choose the address your deliveries go to.",
};

export default async function AccountAddressesPage() {
  // Delivery addresses belong to an account, so a signed-out visitor is sent
  // to the login screen and returned here afterwards.
  const user = await requireCustomerSession("/app/account/addresses");

  const addresses = await listAddresses(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/app/account"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sand-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to your account
        </Link>
      </nav>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Delivery addresses
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          The address you pick as the default is the one your weekly deliveries
          go to. Saved orders keep their own copy of the address they were
          placed with.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5">
          <MapPin className="size-4 shrink-0 text-sand-500" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight text-sand-900">
            Your addresses
          </h2>
        </div>

        <div className="p-4 sm:p-5">
          <AddressManager addresses={toAddressViews(addresses)} />
        </div>
      </section>
    </div>
  );
}
