import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import AddressManager from "@/components/AddressManager";
import { getSession } from "@/lib/auth/session";
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
  const session = await getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect("/login?next=%2Fapp%2Faccount%2Faddresses");
  }

  const addresses = await listAddresses(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
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
        <h1 className="text-3xl font-semibold tracking-tight text-sand-900">
          Delivery addresses
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          The address you pick as the default is the one your weekly deliveries
          go to. Saved orders keep their own copy of the address they were
          placed with.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-card border border-white/40 bg-white/70 shadow-soft backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-sand-100 bg-sand-50/50 px-5 py-4">
          <MapPin className="size-4 text-sand-500" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight text-sand-900">
            Your addresses
          </h2>
        </div>

        <div className="p-5">
          <AddressManager addresses={toAddressViews(addresses)} />
        </div>
      </section>
    </div>
  );
}
