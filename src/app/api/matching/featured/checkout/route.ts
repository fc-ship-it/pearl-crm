import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrganization, getOrgBillingContactEmail } from "@/lib/data";
import { createFeaturedListingCheckout, StripeNotConfiguredError } from "@/lib/stripe";
import { getAppBaseUrl } from "@/lib/google";

export const runtime = "nodejs";

/** Starts the paid "in evidenza" (featured) checkout for the caller's own
 * org's Business Match card. Requires the profile to already be opted in —
 * paying to be featured in a directory you're not even visible in would
 * just be confusing. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await getOrganization(session.orgId);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!org.match_opt_in) {
    return NextResponse.json({ error: "Attiva prima la visibilità del tuo profilo Business Match." }, { status: 400 });
  }

  const appUrl = getAppBaseUrl(req.url);
  const email = (await getOrgBillingContactEmail(session.orgId)) ?? undefined;

  try {
    const { url } = await createFeaturedListingCheckout({
      orgId: session.orgId,
      customerId: org.stripe_customer_id,
      customerEmail: email,
      successUrl: `${appUrl}/api/billing/stripe/confirm?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(
        "/app/network?featured=1"
      )}`,
      cancelUrl: `${appUrl}/app/network?featured_canceled=1`,
    });
    return NextResponse.json({ redirect_url: url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't connected yet — contact support." }, { status: 503 });
    }
    console.error("Featured listing checkout failed", err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
