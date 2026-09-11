import { getSession } from "@/lib/auth";
import { getOrganization, listMatchProfiles } from "@/lib/data";
import { MATCH_FEATURED_PRICE_AED } from "@/lib/stripe";
import BusinessMatchClient from "@/components/BusinessMatchClient";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; featured?: string; featured_canceled?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const org = (await getOrganization(session!.orgId))!;
  const search = sp.q?.trim() || "";
  const directory = await listMatchProfiles(session!.orgId, search || undefined);

  return (
    <BusinessMatchClient
      initialOwn={{
        optIn: !!org.match_opt_in,
        headline: org.match_headline || "",
        sector: org.match_sector || "",
        offering: org.match_offering || "",
        lookingFor: org.match_looking_for || "",
        contactEmail: org.match_contact_email || "",
        contactPhone: org.match_contact_phone || "",
        featuredActive: !!org.match_featured_active,
      }}
      initialDirectory={directory}
      initialSearch={search}
      justFeatured={sp.featured === "1"}
      featuredCanceled={sp.featured_canceled === "1"}
      featuredPriceAed={MATCH_FEATURED_PRICE_AED}
    />
  );
}
