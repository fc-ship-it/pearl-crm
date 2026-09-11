import { NextRequest, NextResponse } from "next/server";
import {
  listOrgsToMoveToGrace,
  moveOrgToGrace,
  listOrgsToSuspend,
  suspendOrg,
  setPendingPaymentIntent,
  getOrgBillingContactEmail,
  listTrialsToExpire,
} from "@/lib/data";
import { createPaymentIntent, ZiinaNotConfiguredError } from "@/lib/ziina";
import { sendRenewalEmail, sendSuspendedEmail, sendTrialEndedEmail, appUrl } from "@/lib/notify";
import { BILLING_PLANS, BILLING_GRACE_DAYS } from "@/lib/domain";

export const runtime = "nodejs";

/** Daily billing sweep — there is no true silent recurring charge with
 * Ziina today (see src/lib/ziina.ts), so "auto-renewal" is implemented as:
 * the moment a paid period ends, generate a fresh payment link and email it
 * automatically; if it isn't paid within BILLING_GRACE_DAYS, suspend
 * access. Netlify's own scheduled-Next.js-route support is new enough (and
 * unconfirmed on this project's Next.js Runtime version) that we didn't
 * want to bet billing correctness on it silently not firing — instead this
 * is a normal, secret-protected route meant to be hit once a day by an
 * external scheduler (e.g. a free cron-job.org job, or a GitHub Actions
 * scheduled workflow) calling:
 *   GET /api/billing/cron?token=CRON_SECRET
 * See ZIINA_INTEGRATION.md for the exact setup steps. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = {
    movedToGrace: 0,
    renewalEmailsSent: 0,
    trialsEnded: 0,
    suspended: 0,
    errors: [] as string[],
  };
  const url = appUrl();

  // Trials that ran out with no plan ever chosen — same past_due/grace
  // pipeline as a lapsed paid plan (moveOrgToGrace / listOrgsToSuspend
  // below pick these up the same way), just with a "pick a plan" email
  // instead of a specific renewal link since no plan/amount exists yet.
  for (const org of await listTrialsToExpire()) {
    await moveOrgToGrace(org.id);
    results.trialsEnded++;
    const email = await getOrgBillingContactEmail(org.id);
    if (email) {
      await sendTrialEndedEmail({ contactEmail: email, orgName: org.name, graceDays: BILLING_GRACE_DAYS });
    }
  }

  for (const org of await listOrgsToMoveToGrace()) {
    await moveOrgToGrace(org.id);
    results.movedToGrace++;

    const interval = org.billing_interval || "monthly";
    const plan = BILLING_PLANS.find((p) => p.id === interval) || BILLING_PLANS.find((p) => p.id === "monthly")!;
    const email = await getOrgBillingContactEmail(org.id);
    if (!email) continue;

    try {
      const intent = await createPaymentIntent({
        amountAed: plan.amountAed,
        message: `Pearl CRM — ${plan.label} plan renewal`,
        successUrl: `${url}/app/settings/billing?paid=1`,
        cancelUrl: `${url}/app/settings/billing?canceled=1`,
        failureUrl: `${url}/app/settings/billing?failed=1`,
      });
      if (intent.redirect_url) {
        await setPendingPaymentIntent(org.id, intent.id, plan.id);
        await sendRenewalEmail({
          contactEmail: email,
          orgName: org.name,
          planLabel: plan.label,
          amountAed: plan.amountAed,
          redirectUrl: intent.redirect_url,
          graceDays: BILLING_GRACE_DAYS,
        });
        results.renewalEmailsSent++;
      }
    } catch (err) {
      if (!(err instanceof ZiinaNotConfiguredError)) console.error("Renewal payment intent failed", org.id, err);
      results.errors.push(`${org.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  for (const org of await listOrgsToSuspend()) {
    await suspendOrg(org.id);
    results.suspended++;
    const email = await getOrgBillingContactEmail(org.id);
    if (email) await sendSuspendedEmail({ contactEmail: email, orgName: org.name });
  }

  return NextResponse.json({ ok: true, ...results });
}
