import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, id, now } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { notifyOwnerOfSignup, sendWelcomeEmail } from "@/lib/notify";
import { createSubscriptionCheckout, StripeNotConfiguredError } from "@/lib/stripe";
import { redeemPromoCode } from "@/lib/data";
import { getAppBaseUrl } from "@/lib/google";
import { BILLING_PLANS, type BillingIntervalId, type CurrencyId } from "@/lib/domain";

export const runtime = "nodejs";

const schema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // Which plan the card-required trial starts on. Defaults to the
  // highlighted (monthly) plan if the signup form doesn't send one.
  interval: z.enum(["weekly", "monthly", "annual"]).optional(),
  // Which currency Checkout shows/charges — the signup page infers this
  // from the visitor's browser language (no account/locale exists yet to
  // read it from); defaults to AED if the form doesn't send one.
  currency: z.enum(["AED", "EUR"]).optional(),
  // Optional free-access code (see promo_codes in db.ts / redeemPromoCode in
  // data.ts) — a valid one skips Stripe entirely, no card required.
  promoCode: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }
  const { orgName, name, email, password } = parsed.data;

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const trialDays = 7;
  const trialEnds = new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString();
  const interval: BillingIntervalId = parsed.data.interval ?? (BILLING_PLANS.find((p) => p.highlighted)?.id as BillingIntervalId) ?? "monthly";
  const currency: CurrencyId = parsed.data.currency ?? "AED";
  const orgId = id();
  const appUrl = getAppBaseUrl(req.url);

  // A valid promo code is checked (and its one redemption counted) before
  // anything else — same "nothing written on failure" reasoning as the
  // Stripe branch below: an invalid code must never leave behind a
  // half-created, email-taken account.
  let promoGrant: { bonusDays: number } | null = null;
  if (parsed.data.promoCode) {
    promoGrant = await redeemPromoCode(parsed.data.promoCode);
    if (!promoGrant) {
      return NextResponse.json({ error: "Codice promozionale non valido o esaurito." }, { status: 400 });
    }
  }

  // Create the Stripe Checkout session FIRST, before writing anything to the
  // database — skipped entirely for a redeemed promo code, which needs no
  // card at all. If Stripe isn't configured (or the API call fails for any
  // reason), nothing is created — an org+user pair with no working access
  // and a now-"taken" email that could never sign up again would otherwise
  // be left behind on every failed attempt.
  let checkoutUrl: string | null = null;
  if (!promoGrant) {
    try {
      const { url } = await createSubscriptionCheckout({
        orgId,
        interval,
        currency,
        customerEmail: email,
        successUrl: `${appUrl}/api/billing/stripe/confirm?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(
          "/app/dashboard"
        )}`,
        cancelUrl: `${appUrl}/signup?checkout=canceled`,
        trialDays,
      });
      checkoutUrl = url;
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return NextResponse.json({ error: "Payments aren't connected yet — contact support." }, { status: 503 });
      }
      console.error("Stripe checkout failed during signup", err);
      return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
    }
  }

  // subscription_status starts at 'incomplete', not the column's default
  // 'trialing' — the trial only actually starts once Stripe Checkout above
  // confirms a card (see isAccessBlocked in src/lib/data.ts). trial_ends_at
  // is still recorded now so the legacy cron fallback has a sane value if
  // Stripe is never configured on this org for some reason.
  //
  // A promo-code org skips all of that: it's created already 'active', with
  // billing_period_end set to the grant's end date and no stripe_subscription_id
  // — the same shape grantManualPlan already uses for a manually-granted
  // customer, which the existing grace/suspend cron already knows how to
  // expire without any new logic.
  const billingPeriodEnd = promoGrant ? new Date(Date.now() + promoGrant.bonusDays * 24 * 3600 * 1000).toISOString() : null;
  await db
    .prepare(
      `INSERT INTO organizations
       (id, name, plan, trial_ends_at, promo_bonus_days, created_at, subscription_status, billing_period_end)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      orgId,
      orgName,
      promoGrant ? "promo" : "trial",
      trialEnds,
      promoGrant?.bonusDays ?? 0,
      now(),
      promoGrant ? "active" : "incomplete",
      billingPeriodEnd
    );

  const userId = id();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db
    .prepare("INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(userId, orgId, name, email, passwordHash, "ADMIN", now());

  for (const provider of ["gmail", "whatsapp", "calendar"]) {
    await db
      .prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)")
      .run(id(), orgId, provider, 0, null);
  }

  // Fire-and-forget: never block or fail signup on this notification.
  notifyOwnerOfSignup({ orgName, contactName: name, contactEmail: email });

  // The welcome email normally waits for Stripe's webhook to confirm a card
  // (see that route) — a promo-code org has no card and no webhook ever
  // coming, so it's already fully active and gets it right now instead.
  if (promoGrant) {
    sendWelcomeEmail({ contactName: name, contactEmail: email, orgName });
  }

  const token = await createSessionToken({ userId, orgId, name, email, role: "ADMIN" });
  const res = NextResponse.json({ redirect_url: checkoutUrl ?? "/app/dashboard" });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
