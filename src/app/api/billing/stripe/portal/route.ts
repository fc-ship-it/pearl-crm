import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrganization } from "@/lib/data";
import { createBillingPortalSession, StripeNotConfiguredError } from "@/lib/stripe";
import { getAppBaseUrl } from "@/lib/google";

export const runtime = "nodejs";

/** Sends the org to Stripe's own hosted Customer Portal — update card,
 * see invoices, cancel or resume — rather than us building any of that UI
 * ourselves. Requires the org to already have a stripe_customer_id (i.e.
 * they've been through Checkout at least once) and the Customer Portal to
 * be turned on in the Stripe dashboard (Settings → Billing → Customer
 * portal — a one-time setup step for the account owner). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await getOrganization(session.orgId);
  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account on file yet." }, { status: 400 });
  }

  const appUrl = getAppBaseUrl(req.url);
  try {
    const { url } = await createBillingPortalSession({
      customerId: org.stripe_customer_id,
      returnUrl: `${appUrl}/app/settings/billing`,
    });
    return NextResponse.json({ redirect_url: url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't connected yet — contact support." }, { status: 503 });
    }
    console.error("Stripe portal session failed", err);
    return NextResponse.json({ error: "Couldn't open the billing portal. Please try again." }, { status: 502 });
  }
}
