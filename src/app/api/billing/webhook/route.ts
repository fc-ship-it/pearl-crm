import { NextRequest, NextResponse } from "next/server";
import { findOrgByPendingPaymentIntent, applyCompletedPayment } from "@/lib/data";
import { getPaymentIntent, ZiinaNotConfiguredError } from "@/lib/ziina";

export const runtime = "nodejs";

/** Ziina's webhook callback. We deliberately never trust the webhook body's
 * own claim of "completed" — Ziina's exact payload shape and signature
 * header aren't published clearly enough to verify safely, so instead we
 * only use the body to find *which* payment intent it's about, then ask
 * Ziina's API directly (with our own bearer token) what that intent's real
 * status is. That also means a forged webhook call can't fabricate a
 * payment — at worst it makes us re-check a real intent we already control.
 * This is a best-effort safety net: the billing page's own check on the
 * success-page redirect (see /app/settings/billing) is the primary path,
 * this just catches the case where the customer closes the tab first. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paymentIntentId: string | undefined =
    body?.id || body?.data?.id || body?.payment_intent?.id || body?.object?.id || body?.payment_intent_id;

  if (!paymentIntentId) {
    // Not a shape we recognize — acknowledge anyway so Ziina doesn't retry
    // forever on something we'll never be able to parse.
    return NextResponse.json({ ok: true, note: "no payment intent id found in payload" });
  }

  const org = findOrgByPendingPaymentIntent(paymentIntentId);
  if (!org) {
    // Either already applied (and cleared) or not ours — nothing to do.
    return NextResponse.json({ ok: true });
  }

  try {
    const intent = await getPaymentIntent(paymentIntentId);
    if (intent.status === "completed") {
      applyCompletedPayment(org.id, paymentIntentId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZiinaNotConfiguredError) {
      return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
    }
    console.error("Ziina webhook verification failed", err);
    // 200 anyway — the success-page check will still catch a real payment;
    // we don't want Ziina hammering retries over our own transient errors.
    return NextResponse.json({ ok: false });
  }
}
