import { NextRequest, NextResponse } from "next/server";
import { applyStripeSubscription } from "@/lib/data";
import { getCheckoutSession, getSubscription, normalizeSubscription, StripeNotConfiguredError } from "@/lib/stripe";
import { getAppBaseUrl } from "@/lib/google";

export const runtime = "nodejs";

/** Where Stripe Checkout's `success_url` always points (both the new-signup
 * flow in /api/auth/signup and the reactivation flow in
 * /api/billing/stripe/checkout use this). It reconciles the org's row
 * *synchronously*, before redirecting on to `next` — this is what avoids a
 * race against the webhook: without this, a brand-new org could land on
 * /app/dashboard while still `incomplete` (webhook not yet delivered) and
 * get bounced straight to /billing-required right after paying. The webhook
 * (/api/billing/stripe/webhook) is the durable second path for the case
 * where the customer closes the tab before this redirect ever fires. */
export async function GET(req: NextRequest) {
  const appUrl = getAppBaseUrl(req.url);
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const rawNext = req.nextUrl.searchParams.get("next") || "/app/dashboard";
  // Only ever redirect back into our own app — never follow a `next` an
  // attacker could have crafted into an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app/dashboard";

  if (!sessionId) return NextResponse.redirect(`${appUrl}${next}`);

  try {
    const checkoutSession = await getCheckoutSession(sessionId);
    const orgId = checkoutSession.client_reference_id || (checkoutSession.metadata?.orgId as string | undefined);
    const subscriptionId =
      typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;

    if (orgId && subscriptionId) {
      const sub = await getSubscription(subscriptionId);
      applyStripeSubscription(orgId, normalizeSubscription(sub));
    }
  } catch (err) {
    if (!(err instanceof StripeNotConfiguredError)) {
      console.error("Stripe checkout confirm failed", err);
    }
    // Fall through and redirect anyway — the webhook is the durable path;
    // this best-effort sync check just makes the common case race-free.
  }

  return NextResponse.redirect(`${appUrl}${next}`);
}
