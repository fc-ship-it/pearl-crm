// Thin wrapper around the official Stripe SDK — the payment gateway chosen to
// replace Ziina specifically because it can charge a saved card again on its
// own, silently, when a trial ends (see ZIINA_INTEGRATION.md for why Ziina
// couldn't do this). Everything billing-related that talks to Stripe's API
// lives here so the rest of the app never imports the `stripe` package
// directly — same separation as src/lib/ziina.ts.
//
// Setup required in Stripe's dashboard (done once, by the account owner —
// never by an assistant, since it's a live secret key):
//   1. Create a Stripe account (UAE trade license + Emirates ID/passport for
//      25%+ owners, or the MOA for an LLC — Stripe supports UAE payouts).
//   2. Developers → API keys → copy the *secret* key → set STRIPE_SECRET_KEY
//      in Netlify's environment variables.
//   3. Developers → Webhooks → add endpoint `${APP_URL}/api/billing/stripe/webhook`,
//      subscribe to: checkout.session.completed, customer.subscription.updated,
//      customer.subscription.deleted, invoice.payment_failed. Copy the
//      signing secret → set STRIPE_WEBHOOK_SECRET in Netlify.
//   4. Settings → Billing → Customer portal: turn it on (lets a customer
//      update their card or cancel from a Stripe-hosted page — see
//      /api/billing/stripe/portal).

import Stripe from "stripe";
import { BILLING_PLANS, type BillingIntervalId } from "./domain";
import type { SubscriptionStatus } from "./data";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe isn't connected yet — STRIPE_SECRET_KEY is not set.");
    this.name = "StripeNotConfiguredError";
  }
}

let cached: Stripe | null = null;

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeNotConfiguredError();
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** AED amounts are whole dirhams in our own code (see BILLING_PLANS);
 * Stripe's `unit_amount` is in fils, the smallest AED unit — same
 * "smallest unit" convention as Ziina. */
function aedToFils(amountAed: number): number {
  return Math.round(amountAed * 100);
}

function intervalFromStripe(stripeInterval: string): BillingIntervalId | null {
  return BILLING_PLANS.find((p) => p.stripeInterval === stripeInterval)?.id ?? null;
}

/**
 * Starts a Stripe Checkout session for one plan, in `subscription` mode.
 *
 * - `trialDays` (only passed for a brand-new signup): `trial_period_days` +
 *   `payment_method_collection: "always"` together are what make this a real
 *   card-required trial — Stripe collects and validates the card up front
 *   (a $0 authorization) even though nothing is charged until the trial
 *   ends, and then auto-charges it at the end unless the subscription is
 *   canceled first.
 * - Called again later (reactivating a suspended org, or a fresh org
 *   choosing a plan after `billing-required`) with no `trialDays`, it
 *   charges immediately — same as the old Ziina checkout did.
 * - `price_data` is inline rather than a pre-created Stripe Product/Price,
 *   so the three plans in BILLING_PLANS stay the single source of truth
 *   without needing to keep a Stripe dashboard in sync.
 */
export async function createSubscriptionCheckout(params: {
  orgId: string;
  interval: BillingIntervalId;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<{ url: string }> {
  const plan = BILLING_PLANS.find((p) => p.id === params.interval);
  if (!plan) throw new Error(`Unknown billing interval: ${params.interval}`);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: params.customerEmail,
    client_reference_id: params.orgId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "aed",
          unit_amount: aedToFils(plan.amountAed),
          recurring: { interval: plan.stripeInterval },
          product_data: { name: `Pearl CRM — ${plan.label} plan` },
        },
      },
    ],
    subscription_data: {
      metadata: { orgId: params.orgId, interval: params.interval },
      ...(params.trialDays
        ? { trial_period_days: params.trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } }
        : {}),
    },
    // Forces card entry even when nothing is due today (a trial) — without
    // this, Stripe skips card collection on a $0-due Checkout, which is
    // exactly the "no card required" behavior we're moving away from.
    payment_method_collection: "always",
    metadata: { orgId: params.orgId, interval: params.interval },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { url: session.url };
}

export type NormalizedSubscription = {
  customerId: string;
  subscriptionId: string;
  status: SubscriptionStatus;
  intervalId: BillingIntervalId | null;
  periodEndIso: string | null;
  cancelAtPeriodEnd: boolean;
};

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "suspended",
  unpaid: "suspended",
  incomplete_expired: "suspended",
  incomplete: "incomplete",
  paused: "suspended",
};

/** Turns a raw Stripe Subscription into the plain shape data.ts writes to
 * the organizations row — kept here so nowhere else needs a Stripe type.
 * NOTE: `current_period_end`/`current_period_start` moved off the top-level
 * Subscription object in recent Stripe API versions — they now live per
 * line item, hence `items.data[0]`. */
export function normalizeSubscription(sub: Stripe.Subscription): NormalizedSubscription {
  const item = sub.items.data[0];
  const priceInterval = item?.price?.recurring?.interval;
  return {
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    status: STATUS_MAP[sub.status] ?? "past_due",
    intervalId: priceInterval ? intervalFromStripe(priceInterval) : null,
    periodEndIso: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

export async function getSubscription(id: string): Promise<Stripe.Subscription> {
  return stripe().subscriptions.retrieve(id);
}

export async function getCheckoutSession(id: string): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.retrieve(id);
}

/** A Stripe-hosted page where a customer can update their card, see past
 * invoices, or cancel — avoids building any of that ourselves. Requires the
 * Customer Portal to be turned on once in the Stripe dashboard (Settings →
 * Billing → Customer portal). */
export async function createBillingPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
  const session = await stripe().billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

/** Verifies a webhook payload really came from Stripe using the raw request
 * body + the `stripe-signature` header — never trust an unverified webhook
 * body, same principle as (but more robust than) the Ziina webhook, since
 * Stripe's signing scheme is fully documented and supported by the SDK. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new StripeNotConfiguredError();
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
