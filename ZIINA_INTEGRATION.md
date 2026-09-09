# Real billing with Ziina — how it works and how to turn it on

Pearl's Plan & Billing page (`/app/settings/billing`) now charges real money
through [Ziina](https://ziina.com), the UAE payment provider AHEAD LLC chose.
This document explains the design, why it works the way it does, and the
exact steps to activate it in production.

## Why this design (and not "true" auto-renewal)

Ziina's public API (confirmed both from `docs.ziina.com` and from their own
support bot, September 2026) is built around single-shot **payment
intents**: your server creates one for a fixed amount, the customer is
redirected to a hosted page, they pay with card / Apple Pay / Google Pay,
and that's it — there is no documented way to store a customer's card and
charge it again later without them coming back to approve it. So a truly
silent "auto-renewal" (like a Stripe subscription) isn't something we can
build against their current public API.

Instead, "auto-renewal" here means:

1. The moment a paid period ends, the app automatically generates a **new**
   payment intent and emails the link to the org's billing contact.
2. The org has `BILLING_GRACE_DAYS` (3, see `src/lib/domain.ts`) to pay it.
3. If it isn't paid in time, access is suspended — the org is redirected to
   `/billing-required` on every `/app/*` page until they pay. Nothing is
   ever deleted.

This is honest about what Ziina can do today, and it's a five-minute change
to swap in true silent billing later if Ziina (or a provider switch) adds
real recurring charges — everything downstream of "a payment completed"
(extending the period, reactivating the org) is already provider-agnostic
in `src/lib/data.ts`.

## The moving parts

- `src/lib/ziina.ts` — the API client: `createPaymentIntent`,
  `getPaymentIntent`, `registerWebhook`.
- `src/lib/domain.ts` — `BILLING_PLANS` (the three plans: weekly AED 24,
  monthly AED 80, annual AED 800) and `BILLING_GRACE_DAYS`. Change prices
  here — nowhere else.
- `src/lib/data.ts` — the org's billing state (`billing_interval`,
  `billing_period_end`, `subscription_status`, `grace_until`,
  `pending_payment_intent_id`) and the functions that move it forward:
  `setPendingPaymentIntent`, `applyCompletedPayment`,
  `listOrgsToMoveToGrace` / `moveOrgToGrace`, `listOrgsToSuspend` /
  `suspendOrg`, and `isAccessBlocked` (the actual gate check).
- `src/app/api/billing/checkout` — starts a checkout for the plan the
  customer picked (used by the `SubscribeButton` component).
- `src/app/api/billing/webhook` — Ziina's webhook callback. It never trusts
  the webhook body's own claim of "completed" — it only uses it to find
  *which* payment intent changed, then asks Ziina's API directly (with our
  own bearer token) what that intent's real status is. This also means a
  forged webhook call can't fabricate a payment.
- `src/app/api/billing/cron` — the daily sweep (see "Scheduling" below).
- `src/app/billing-required` — where a suspended org lands.
- `src/app/app/layout.tsx` — the actual enforcement point: redirects to
  `/billing-required` when `isAccessBlocked(org)`.
- Owner Dashboard → `OrgActions` → the plan dropdown now calls
  `grantManualPlan`, for a customer who paid AHEAD LLC directly (bank
  transfer, cash, a Ziina transfer straight to your account) rather than
  through the in-app Ziina checkout.

## Activating it: environment variables

Add these on Netlify (Site settings → Environment variables), same place as
`GOOGLE_CLIENT_ID` / `RESEND_API_KEY`:

| Variable | Value | Required for |
|---|---|---|
| `ZIINA_ACCESS_TOKEN` | Your Ziina API key | Every real charge |
| `CRON_SECRET` | Any long random string you make up | The daily renewal sweep |
| `APP_URL` | Already set (`https://pearl-crm.netlify.app`) | Payment redirect URLs |

### Getting `ZIINA_ACCESS_TOKEN`

1. Go to <https://ziina.com/business/connect>.
2. Choose **"Other builder or custom."**
3. Verify with phone number, OTP, and email.
4. The API key is shown **once** — copy it immediately and paste it into
   Netlify's `ZIINA_ACCESS_TOKEN` variable (don't lose it; Ziina won't show
   it again — you'd have to generate a new one).

Once that variable is set and the site redeploys, checkout on
`/app/settings/billing` starts creating real payment intents.

### Registering the webhook (optional but recommended)

The webhook catches the case where a customer pays but closes the tab
before being redirected back to Pearl (the redirect-based check on
`/app/settings/billing` is the primary path and works without this). Once
`ZIINA_ACCESS_TOKEN` and `CRON_SECRET` are both set and deployed, register
it by just opening this URL once in a browser (reuses `CRON_SECRET` so
there's no third secret to manage):

```
https://pearl-crm.netlify.app/api/billing/register-webhook?token=<your CRON_SECRET>
```

It's safe to open more than once (e.g. after moving to a new domain) — it
just re-registers the same URL.

### Scheduling the daily renewal check

`/api/billing/cron?token=CRON_SECRET` needs to be called once a day. Netlify
does have a scheduled-Next.js-route feature, but its exact support for this
project's App Router + Next.js Runtime version isn't confirmed, and a
billing check silently not firing is the wrong kind of thing to find out
about later — so instead, point a plain external scheduler at it:

- **Easiest**: a free account at [cron-job.org](https://cron-job.org) — add
  a job that does a daily `GET` to
  `https://pearl-crm.netlify.app/api/billing/cron?token=<your CRON_SECRET>`.
- **Alternative**: a GitHub Actions scheduled workflow in this repo (a
  `schedule: cron:` trigger calling the same URL with `curl`).

The route is idempotent and safe to call more than once a day if you want
tighter timing (e.g. hourly) — it only acts on orgs that are actually due.

## Testing without spending real money

Pass `test: true` when creating a payment intent (see Ziina's test cards at
`docs.ziina.com/test-cards`) to run the whole flow against Ziina's sandbox
before going live with real customers.

## What still needs a human decision

- **Weekly plan**: Ziina's own team told us "weekly billing is not
  mentioned as an available option" for their subscription-style products —
  but since we're not using a Ziina "subscription" object at all (just
  repeated one-off payment intents), the weekly plan works identically to
  monthly/annual from Pearl's side. No action needed, just noting it in
  case Ziina's product terms shift.
- **True silent recurring billing**: if Ziina later documents a way to
  charge a saved payment method without the customer returning to a page
  (ask their business/sales team via the "Custom API — Get in touch" option
  in the Ziina app), swap the cron job's "generate + email a link" step for
  a direct off-session charge — `applyCompletedPayment` and everything else
  downstream stays the same.
