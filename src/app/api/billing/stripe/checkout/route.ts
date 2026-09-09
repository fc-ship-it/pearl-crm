import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrganization, getOrgBillingContactEmail } from "@/lib/data";
import { createSubscriptionCheckout, StripeNotConfiguredError } from "@/lib/stripe";
import { getAppBaseUrl } from "@/lib/google";
import { BILLING_PLANS, type BillingIntervalId } from "@/lib/domain";

export const runtime = "nodejs";

const VALID_INTERVALS = new Set<string>(BILLING_PLANS.map((p) => p.id));

/** Starts a Stripe Checkout for an org that's already logged in — reactivating
 * a suspended/past_due org, or a legacy card-less trial choosing a plan for
 * the first time. No trial is attached here (see /api/auth/signup for the
 * card-required-trial version): this always charges immediately, same as
 * the old Ziina checkout did. Used from both the Plan & Billing settings
 * page and the /billing-required screen. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const interval = body?.interval as BillingIntervalId | undefined;
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const org = getOrganization(session.orgId);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const appUrl = getAppBaseUrl(req.url);
  const email = getOrgBillingContactEmail(session.orgId) ?? undefined;

  try {
    const { url } = await createSubscriptionCheckout({
      orgId: session.orgId,
      interval,
      customerEmail: email,
      successUrl: `${appUrl}/api/billing/stripe/confirm?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(
        "/app/settings/billing?paid=1"
      )}`,
      cancelUrl: `${appUrl}/app/settings/billing?canceled=1`,
      // An `incomplete` org never actually started its trial (signup was
      // abandoned before finishing Checkout) — give it the real 7-day trial
      // here instead of charging immediately, so it isn't cheated out of
      // the trial it was promised. Everyone else (reactivating after
      // suspended/past_due, or a legacy trial choosing a plan) pays now.
      trialDays: org.subscription_status === "incomplete" ? 7 : undefined,
    });
    return NextResponse.json({ redirect_url: url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't connected yet — contact support." }, { status: 503 });
    }
    console.error("Stripe checkout failed", err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
