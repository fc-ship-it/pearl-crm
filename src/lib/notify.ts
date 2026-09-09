// Best-effort email notification to AHEAD LLC whenever a new business signs
// up for Pearl. Uses Resend (https://resend.com) because it needs nothing
// more than a free API key — no SMTP server to run, no credentials beyond
// one string. Everything here is optional: if RESEND_API_KEY or
// OWNER_NOTIFY_EMAIL isn't set, this quietly does nothing. Signup itself
// never fails or waits on this — the Owner Dashboard (/owner/dashboard) is
// always the reliable way to see every signup, whether or not email is
// configured.

export function appUrl(): string {
  return (process.env.APP_URL || "https://pearl-crm.netlify.app").replace(/\/+$/, "");
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[notify] RESEND_API_KEY not set — skipped email "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Pearl <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      // This used to be swallowed completely — the single most common cause
      // is Resend's sandbox sender (onboarding@resend.dev, used whenever
      // RESEND_FROM_EMAIL isn't set) refusing to deliver to anyone except
      // the Resend account's own verified email, with a 403 and a message
      // like "You can only send testing emails to your own email address."
      // Logging it here means Netlify's function logs actually show *why*
      // an email never arrived, instead of nothing at all. Fix: verify a
      // sending domain in Resend (Domains → Add Domain) and set
      // RESEND_FROM_EMAIL to an address on it, e.g. "Pearl <noreply@your-domain.com>".
      const body = await res.text().catch(() => "");
      console.error(`[notify] Resend rejected email "${subject}" to ${to}: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`[notify] Failed to reach Resend for email "${subject}" to ${to}`, err);
  }
}

export async function notifyOwnerOfSignup(info: {
  orgName: string;
  contactName: string;
  contactEmail: string;
}) {
  const toEmail = process.env.OWNER_NOTIFY_EMAIL;
  if (!toEmail) return; // not configured — dashboard is the fallback
  await sendEmail(
    toEmail,
    `New Pearl signup: ${info.orgName}`,
    [
      `A new business just registered on Pearl.`,
      ``,
      `Company: ${info.orgName}`,
      `Contact: ${info.contactName}`,
      `Email: ${info.contactEmail}`,
      ``,
      `See all signups: (open your Pearl Owner Dashboard at /owner/dashboard)`,
    ].join("\n")
  );
}

// Welcome email sent to the person who just signed up. Same best-effort,
// Resend-based approach as notifyOwnerOfSignup — if RESEND_API_KEY isn't
// set, this quietly does nothing (signup itself never fails or waits on
// this). Note: on Resend's free/sandbox tier without a verified sending
// domain, mail can only be delivered to the account owner's own verified
// email address — verify a domain in Resend for this to reach real
// customers. See RESEND_FROM_EMAIL in the README.
export async function sendWelcomeEmail(info: { contactName: string; contactEmail: string; orgName: string }) {
  const firstName = info.contactName.trim().split(/\s+/)[0] || info.contactName;
  const url = appUrl();
  await sendEmail(
    info.contactEmail,
    "Welcome to Pearl — your 7-day trial has started",
    [
      `Hi ${firstName},`,
      ``,
      `Welcome to Pearl! Your account for ${info.orgName} is ready, and your 7-day free trial has started.`,
      ``,
      `Get started: ${url}/app/dashboard`,
      ``,
      `A few things to try first:`,
      `- Add your first contacts (manually, by scanning a QR code, or by importing them from your phone) → ${url}/app/contacts/new`,
      `- Connect Gmail, Calendar or WhatsApp → ${url}/app/settings/integrations`,
      ``,
      `Questions? Just reply to this email.`,
      ``,
      `— The Pearl team`,
    ].join("\n")
  );
}

// Sent automatically each time an org's paid (or trial) period runs out —
// see /api/billing/cron. Ziina doesn't support silently charging a saved
// card again (see src/lib/ziina.ts), so "auto-renewal" here means: a fresh
// payment link is generated and emailed the moment the period ends, with a
// few days of grace before access is actually suspended.
export async function sendRenewalEmail(info: {
  contactEmail: string;
  orgName: string;
  planLabel: string;
  amountAed: number;
  redirectUrl: string;
  graceDays: number;
}) {
  await sendEmail(
    info.contactEmail,
    `Pearl — renew your ${info.planLabel} plan (AED ${info.amountAed})`,
    [
      `Hi,`,
      ``,
      `${info.orgName}'s ${info.planLabel} plan on Pearl has just ended.`,
      ``,
      `Renew now (AED ${info.amountAed}): ${info.redirectUrl}`,
      ``,
      `You have ${info.graceDays} day${info.graceDays === 1 ? "" : "s"} before access pauses — no data is deleted, and everything picks back up the moment you renew.`,
      ``,
      `— The Pearl team`,
    ].join("\n")
  );
}

// Sent once when the free trial itself runs out with no plan ever chosen —
// unlike sendRenewalEmail there's no specific plan/amount to point at yet
// (the customer hasn't picked one), so this just points at the pricing page.
export async function sendTrialEndedEmail(info: { contactEmail: string; orgName: string; graceDays: number }) {
  const url = appUrl();
  await sendEmail(
    info.contactEmail,
    "Pearl — your free trial has ended",
    [
      `Hi,`,
      ``,
      `${info.orgName}'s 7-day free trial on Pearl has ended.`,
      ``,
      `Choose a plan to keep going (weekly, monthly or annual): ${url}/app/settings/billing`,
      ``,
      `You have ${info.graceDays} day${info.graceDays === 1 ? "" : "s"} before access pauses — no data is deleted, and everything picks back up the moment you subscribe.`,
      ``,
      `— The Pearl team`,
    ].join("\n")
  );
}

// Sent when Stripe couldn't charge a renewal (card expired, insufficient
// funds, etc). Stripe itself keeps retrying for a while (Smart Retries)
// before the subscription is actually canceled, so this just points the
// customer at updating their card — see /api/billing/stripe/portal.
export async function sendPaymentFailedEmail(info: { contactEmail: string; orgName: string }) {
  const url = appUrl();
  await sendEmail(
    info.contactEmail,
    "Pearl — your last payment didn't go through",
    [
      `Hi,`,
      ``,
      `We tried to charge the card on file for ${info.orgName}'s Pearl subscription and it didn't go through.`,
      ``,
      `Update your card to keep access: ${url}/app/settings/billing`,
      ``,
      `We'll automatically retry a few more times before anything is paused — no data is ever deleted.`,
      ``,
      `— The Pearl team`,
    ].join("\n")
  );
}

// Sent once an org's grace period has actually run out and access has been
// suspended.
export async function sendSuspendedEmail(info: { contactEmail: string; orgName: string }) {
  const url = appUrl();
  await sendEmail(
    info.contactEmail,
    "Pearl — access paused, renew to continue",
    [
      `Hi,`,
      ``,
      `${info.orgName}'s Pearl access has been paused because the last invoice wasn't paid.`,
      ``,
      `Nothing was deleted — renew any time to pick up exactly where you left off: ${url}/app/settings/billing`,
      ``,
      `— The Pearl team`,
    ].join("\n")
  );
}
