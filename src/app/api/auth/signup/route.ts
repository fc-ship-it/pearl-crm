import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, id, now } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { notifyOwnerOfSignup } from "@/lib/notify";
import { createSubscriptionCheckout, StripeNotConfiguredError } from "@/lib/stripe";
import { getAppBaseUrl } from "@/lib/google";
import { BILLING_PLANS, type BillingIntervalId } from "@/lib/domain";

export const runtime = "nodejs";

const schema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // Which plan the card-required trial starts on. Defaults to the
  // highlighted (monthly) plan if the signup form doesn't send one.
  interval: z.enum(["weekly", "monthly", "annual"]).optional(),
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
  const orgId = id();
  const appUrl = getAppBaseUrl(req.url);

  // Create the Stripe Checkout session FIRST, before writing anything to the
  // database. If Stripe isn't configured (or the API call fails for any
  // reason), nothing is created — an org+user pair with no working access
  // and a now-"taken" email that could never sign up again would otherwise
  // be left behind on every failed attempt.
  let checkoutUrl: string;
  try {
    const { url } = await createSubscriptionCheckout({
      orgId,
      interval,
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

  // subscription_status starts at 'incomplete', not the column's default
  // 'trialing' — the trial only actually starts once Stripe Checkout above
  // confirms a card (see isAccessBlocked in src/lib/data.ts). trial_ends_at
  // is still recorded now so the legacy cron fallback has a sane value if
  // Stripe is never configured on this org for some reason.
  await db
    .prepare(
      "INSERT INTO organizations (id, name, plan, trial_ends_at, promo_bonus_days, created_at, subscription_status) VALUES (?,?,?,?,?,?,?)"
    )
    .run(orgId, orgName, "trial", trialEnds, 0, now(), "incomplete");

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

  // Fire-and-forget: never block or fail signup on this notification. The
  // welcome email itself is now sent later, once Checkout actually confirms
  // a card (see the webhook) — sending it here would be premature since the
  // account has no access yet.
  notifyOwnerOfSignup({ orgName, contactName: name, contactEmail: email });

  const token = await createSessionToken({ userId, orgId, name, email, role: "ADMIN" });
  const res = NextResponse.json({ redirect_url: checkoutUrl });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
