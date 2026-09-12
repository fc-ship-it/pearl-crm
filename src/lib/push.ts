// Real Web Push notifications (the actual browser/OS push a phone can show
// even when Pearl isn't open) — separate from in-app banners/emails. Needs
// three pieces working together: a VAPID keypair (identifies this app to
// the push services, generated once — see README), a service worker
// (public/sw.js) that receives the push and shows the notification, and a
// subscription per device stored in push_subscriptions (see db.ts).
//
// Setup required (done once, by the account owner):
//   1. A VAPID keypair was generated for this project — see README for the
//      exact values already generated for you.
//   2. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or
//      https: contact URL, e.g. mailto:ceo@ahead-llc.com) as environment
//      variables on Netlify, then redeploy.
//   3. In Pearl, each salesperson turns on notifications once from Settings
//      → Notifications ("Attiva notifiche") — this only works from the app
//      installed on the home screen (not a regular browser tab), and on
//      iPhone needs iOS 16.4+.
//   4. For the scheduled checks (due reminders, tasks due soon) to actually
//      fire, set up a free external cron (e.g. cron-job.org) hitting
//      GET {APP_URL}/api/push/cron?token=CRON_SECRET every 15 minutes —
//      same CRON_SECRET env var and same "external pinger" pattern already
//      used for the billing sweep (see /api/billing/cron).

import webpush from "web-push";
import { deletePushSubscriptionByEndpoint, type PushSubscriptionRow } from "./data";

export class PushNotConfiguredError extends Error {
  constructor() {
    super("Push notifications aren't configured yet — VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set.");
    this.name = "PushNotConfiguredError";
  }
}

let configured = false;

function ensureConfigured(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:ceo@ahead-llc.com";
  if (!publicKey || !privateKey) throw new PushNotConfiguredError();
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Sends one push to one subscribed device. A 404/410 response means the
 * browser itself revoked the subscription (uninstalled, permissions reset,
 * etc.) — in that case we clean up the now-dead row instead of leaving it
 * to fail forever on every future sweep. */
async function sendToSubscription(sub: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await deletePushSubscriptionByEndpoint(sub.endpoint);
    } else {
      console.error("Push send failed", sub.endpoint, err?.statusCode, err?.body);
    }
  }
}

/** Sends the same push to every device a set of users has subscribed. Never
 * throws for individual send failures (see sendToSubscription) — only
 * throws PushNotConfiguredError if VAPID isn't set up at all, so callers
 * can distinguish "not configured" from "some devices unreachable". */
export async function sendPushToSubscriptions(subs: PushSubscriptionRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  ensureConfigured();
  await Promise.all(subs.map((s) => sendToSubscription(s, payload)));
}
