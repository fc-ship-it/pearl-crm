import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setPendingPaymentIntent } from "@/lib/data";
import { createPaymentIntent, ZiinaNotConfiguredError } from "@/lib/ziina";
import { getAppBaseUrl } from "@/lib/google";
import { BILLING_PLANS, type BillingIntervalId } from "@/lib/domain";

export const runtime = "nodejs";

const VALID_INTERVALS = new Set<string>(BILLING_PLANS.map((p) => p.id));

/** Starts a checkout: creates a Ziina payment intent for the chosen plan and
 * remembers it as "pending" on the org, then hands the browser the hosted
 * payment page URL to redirect to. Used both from the normal Plan & Billing
 * page and from the /billing-required screen a suspended org lands on. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const interval = body?.interval as BillingIntervalId | undefined;
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  const plan = BILLING_PLANS.find((p) => p.id === interval)!;
  const appUrl = getAppBaseUrl(req.url);

  try {
    const intent = await createPaymentIntent({
      amountAed: plan.amountAed,
      message: `Pearl CRM — ${plan.label} plan`,
      successUrl: `${appUrl}/app/settings/billing?paid=1`,
      cancelUrl: `${appUrl}/app/settings/billing?canceled=1`,
      failureUrl: `${appUrl}/app/settings/billing?failed=1`,
    });
    if (!intent.redirect_url) {
      throw new Error("Ziina did not return a redirect_url");
    }
    setPendingPaymentIntent(session.orgId, intent.id, interval);
    return NextResponse.json({ redirect_url: intent.redirect_url });
  } catch (err) {
    if (err instanceof ZiinaNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't connected yet — contact support." }, { status: 503 });
    }
    console.error("Ziina checkout failed", err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
