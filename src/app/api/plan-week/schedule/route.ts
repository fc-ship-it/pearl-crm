import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, id, now } from "@/lib/db";
import { getDeal } from "@/lib/data";
import { getValidGoogleAccessToken, createCalendarEvent } from "@/lib/google";
import { getValidOutlookAccessToken, createOutlookCalendarEvent } from "@/lib/outlook";

export const runtime = "nodejs";

/**
 * Turns one "Plan my week" suggestion into a real commitment: a task due on
 * the chosen day (so it shows up everywhere tasks already do), plus — if
 * Google and/or Outlook Calendar is connected for this user — a real
 * calendar event at the given time, with the contact's address in the
 * event's location field so it's one tap to navigate there.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.dealId || !body?.dateISO) {
    return NextResponse.json({ error: "dealId and dateISO are required." }, { status: 400 });
  }

  // A "SALES" teammate can only schedule visits for deals THEY own.
  const viewerOwnerId = session.role === "ADMIN" ? undefined : session.userId;
  const deal = await getDeal(session.orgId, body.dealId, viewerOwnerId);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const start = new Date(body.dateISO);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "invalid dateISO" }, { status: 400 });
  const end = new Date(start.getTime() + 45 * 60 * 1000);

  const title = `Visit: ${deal.contactName || "contact"} — ${deal.title}`;

  const taskId = id();
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(taskId, session.orgId, deal.contactId, deal.id, title, start.toISOString(), 0, "high", deal.ownerId || session.userId, now());

  let calendar: "google" | "outlook" | "both" | null = null;
  const googleAccessToken = await getValidGoogleAccessToken(session.orgId, session.userId).catch(() => null);
  const outlookAccessToken = await getValidOutlookAccessToken(session.orgId, session.userId).catch(() => null);
  if (googleAccessToken || outlookAccessToken) {
    const eventPayload = {
      summary: title,
      description: `Follow-up on "${deal.title}" (${deal.value.toLocaleString()} AED) — scheduled from Pearl's weekly planner.`,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      location: deal.contactAddress || undefined,
    };
    let gOk = false;
    let oOk = false;
    if (googleAccessToken) {
      gOk = await createCalendarEvent(googleAccessToken, eventPayload)
        .then(() => true)
        .catch(() => false);
    }
    if (outlookAccessToken) {
      oOk = await createOutlookCalendarEvent(outlookAccessToken, eventPayload)
        .then(() => true)
        .catch(() => false);
    }
    calendar = gOk && oOk ? "both" : gOk ? "google" : oOk ? "outlook" : null;
  }

  await db
    .prepare(
      "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
    )
    .run(id(), session.orgId, deal.contactId, deal.id, "general", `Visit scheduled: ${title}`, now(), now());

  return NextResponse.json({ ok: true, taskId, calendar });
}
