import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, id, now } from "@/lib/db";
import { generateVerbale } from "@/lib/verbale";
import { getValidGoogleAccessToken, createCalendarEvent } from "@/lib/google";
import { getValidOutlookAccessToken, createOutlookCalendarEvent } from "@/lib/outlook";
import { meetingLocationTypeConfig } from "@/lib/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.contactId) {
    return NextResponse.json({ error: "Title and contact are required." }, { status: 400 });
  }

  const contact = (await db
    .prepare("SELECT name FROM contacts WHERE id = ? AND org_id = ?")
    .get(body.contactId, session.orgId)) as { name: string } | undefined;

  const participants = [session.name, contact?.name].filter(Boolean) as string[];
  const summary = generateVerbale(body.transcript || body.agenda || "", participants);

  // The meeting's own date/time is user-settable (defaults to "now" when
  // omitted, for backward compatibility with any older caller). Location
  // type is validated against the known set so a bad/forged value can't get
  // stored — an unrecognized one is treated the same as "not set".
  const meetingDate = body.date && !isNaN(new Date(body.date).getTime()) ? new Date(body.date).toISOString() : now();
  const locationTypeConfig = meetingLocationTypeConfig(body.locationType);
  const locationType = locationTypeConfig?.id ?? null;
  const locationDetail = locationType ? (body.locationDetail || null) : null;

  const meetingId = id();
  await db
    .prepare(
      "INSERT INTO meetings (id, org_id, contact_id, deal_id, title, date, transcript, summary_json, created_at, location_type, location_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      meetingId,
      session.orgId,
      body.contactId,
      body.dealId || null,
      body.title,
      meetingDate,
      body.transcript || body.agenda || null,
      JSON.stringify(summary),
      now(),
      locationType,
      locationDetail
    );

  // If Google Calendar and/or Outlook Calendar is connected, the meeting
  // itself also becomes a real calendar event — the Zoom/Meet link or
  // in-person address (if set) goes in as the event's location. Unlike email
  // (where sending twice would duplicate a message to a contact), creating
  // the same event on both calendars is harmless and is what someone who
  // deliberately connected both mailboxes would expect.
  const googleAccessToken = await getValidGoogleAccessToken(session.orgId, session.userId).catch(() => null);
  const outlookAccessToken = await getValidOutlookAccessToken(session.orgId, session.userId).catch(() => null);

  if (googleAccessToken || outlookAccessToken) {
    const start = new Date(meetingDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const meetingEventPayload = {
      summary: body.title,
      description: `Meeting with ${contact?.name || "contact"} — created automatically by Pearl.`,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      location: locationDetail || (locationTypeConfig ? locationTypeConfig.label : null),
    };
    if (googleAccessToken) {
      await createCalendarEvent(googleAccessToken, meetingEventPayload).catch(() => {
        // Best-effort: a failed calendar sync never blocks saving the meeting.
      });
    }
    if (outlookAccessToken) {
      await createOutlookCalendarEvent(outlookAccessToken, meetingEventPayload).catch(() => {
        // Best-effort: a failed calendar sync never blocks saving the meeting.
      });
    }
  }

  // Next steps automatically become linked tasks, per spec. If Google
  // Calendar and/or Outlook Calendar is connected, each dated one also
  // becomes a real calendar event on every connected calendar.
  for (const step of summary.nextSteps) {
    await db
      .prepare(
        "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(id(), session.orgId, body.contactId, body.dealId || null, step.action, step.dueDate, 0, "medium", session.userId, now());

    if (step.dueDate && (googleAccessToken || outlookAccessToken)) {
      const start = new Date(step.dueDate);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const eventPayload = {
        summary: step.action,
        description: `Follow-up from meeting "${body.title}" with ${contact?.name || "contact"} — created automatically by Pearl.`,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      };
      if (googleAccessToken) {
        await createCalendarEvent(googleAccessToken, eventPayload).catch(() => {
          // Best-effort: a failed calendar sync never blocks saving the task.
        });
      }
      if (outlookAccessToken) {
        await createOutlookCalendarEvent(outlookAccessToken, eventPayload).catch(() => {
          // Best-effort: a failed calendar sync never blocks saving the task.
        });
      }
    }
  }

  await db
    .prepare(
      "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
    )
    .run(id(), session.orgId, body.contactId, body.dealId || null, "meeting", `Meeting: ${body.title}`, now(), now());

  if (body.dealId) {
    await db.prepare("UPDATE deals SET last_interaction_at = ? WHERE id = ? AND org_id = ?").run(now(), body.dealId, session.orgId);
  }

  return NextResponse.json({ ok: true, meetingId });
}
