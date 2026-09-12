import { NextRequest, NextResponse } from "next/server";
import {
  listDueAlertsForPush,
  markAlertPushNotified,
  listTasksDueSoonForPush,
  markTaskPushNotified,
  listPushSubscriptionsForUser,
  listPushSubscriptionsForOrg,
} from "@/lib/data";
import { sendPushToSubscriptions, PushNotConfiguredError } from "@/lib/push";

export const runtime = "nodejs";

/**
 * The push-notification sweep — "so a salesperson can never forget
 * anything," meant to be hit every ~15 minutes by an external cron (same
 * pattern as /api/billing/cron, see push.ts for the exact setup). Two
 * things it looks for, each only ever pushed once (marked via
 * notified_push_at so a re-run 15 minutes later doesn't repeat it):
 *   - custom_alerts (reminders / "reactivate today") that just became due
 *   - tasks due today or tomorrow
 * Payment-failed and trial-ending pushes are NOT here — those fire
 * immediately from the Stripe webhook instead, since there's no reason to
 * wait for the next sweep when Stripe already told us it happened.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = { alertsPushed: 0, tasksPushed: 0, notConfigured: false };

  try {
    for (const alert of await listDueAlertsForPush()) {
      const subs = alert.contactOwnerId
        ? await listPushSubscriptionsForUser(alert.contactOwnerId)
        : await listPushSubscriptionsForOrg(alert.orgId);
      await sendPushToSubscriptions(subs, {
        title: "Promemoria Pearl",
        body: alert.title,
        url: "/app/dashboard",
      });
      await markAlertPushNotified(alert.id);
      results.alertsPushed++;
    }

    for (const task of await listTasksDueSoonForPush()) {
      const subs = task.ownerId ? await listPushSubscriptionsForUser(task.ownerId) : await listPushSubscriptionsForOrg(task.orgId);
      await sendPushToSubscriptions(subs, {
        title: "Attività in scadenza",
        body: task.title,
        url: "/app/pipeline",
      });
      await markTaskPushNotified(task.id);
      results.tasksPushed++;
    }
  } catch (err) {
    if (err instanceof PushNotConfiguredError) {
      results.notConfigured = true;
    } else {
      console.error("Push cron sweep failed", err);
      return NextResponse.json({ ok: false, error: "sweep failed", ...results }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
