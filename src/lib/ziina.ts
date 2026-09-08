// Minimal client for Ziina's payment API (https://docs.ziina.com) — the UAE
// payment provider AHEAD LLC chose for Pearl's billing.
//
// Ziina's public API is built around single-shot "payment intents" (create
// one, redirect the customer to a hosted page, they pay with card/Apple
// Pay/Google Pay) plus a webhook for status changes — there is no
// documented way to store a card and charge it again silently later. So
// "auto-renewal" here means: a fresh payment intent is generated and its
// link is emailed to the org automatically at each renewal, rather than a
// truly silent off-session charge. See ZIINA_INTEGRATION.md for the full
// design and how to swap in real off-session billing if Ziina (or another
// provider) adds it later.
//
// Auth: a single long-lived bearer token, generated once from the Ziina
// Business app under Connect → "Other builder or custom", stored as
// ZIINA_ACCESS_TOKEN. There is no client id/secret exchange for this flow.

const ZIINA_API_BASE = "https://api-v2.ziina.com/api";

export class ZiinaNotConfiguredError extends Error {
  constructor() {
    super("Ziina isn't connected yet — ZIINA_ACCESS_TOKEN is not set.");
    this.name = "ZiinaNotConfiguredError";
  }
}

function accessToken(): string {
  const token = process.env.ZIINA_ACCESS_TOKEN?.trim();
  if (!token) throw new ZiinaNotConfiguredError();
  return token;
}

export type ZiinaPaymentIntentStatus =
  | "requires_payment_instrument"
  | "requires_user_action"
  | "pending"
  | "completed"
  | "failed"
  | "canceled";

export type ZiinaPaymentIntent = {
  id: string;
  status: ZiinaPaymentIntentStatus;
  redirect_url?: string;
  amount?: number;
  currency_code?: string;
  [key: string]: unknown;
};

async function ziinaFetch(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${ZIINA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Ziina API error ${res.status} on ${path}: ${body ? JSON.stringify(body) : res.statusText}`);
  }
  return body;
}

/** AED amounts are in whole dirhams in our own code (see BILLING_PLANS);
 * Ziina's `amount` field is in fils, the smallest AED unit (1 AED = 100
 * fils) — same "smallest unit" convention as Stripe. */
export function aedToFils(amountAed: number): number {
  return Math.round(amountAed * 100);
}

export async function createPaymentIntent(params: {
  amountAed: number;
  message: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl?: string;
  test?: boolean;
}): Promise<ZiinaPaymentIntent> {
  return ziinaFetch("/payment_intent", {
    method: "POST",
    body: JSON.stringify({
      amount: aedToFils(params.amountAed),
      currency_code: "AED",
      message: params.message,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      failure_url: params.failureUrl,
      test: params.test ?? false,
    }),
  });
}

export async function getPaymentIntent(id: string): Promise<ZiinaPaymentIntent> {
  return ziinaFetch(`/payment_intent/${encodeURIComponent(id)}`, { method: "GET" });
}

/** One-off setup call — registers our webhook URL with Ziina so a completed
 * payment can update the org's subscription even if the customer closes the
 * tab before the success-page redirect fires. Safe to call more than once. */
export async function registerWebhook(url: string, secret?: string): Promise<{ success: boolean; error?: string }> {
  return ziinaFetch("/webhook", {
    method: "POST",
    body: JSON.stringify({ url, secret }),
  });
}
