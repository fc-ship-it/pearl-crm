import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, id, now } from "@/lib/db";
import { generateVerbale } from "@/lib/verbale";
import { getValidGoogleAccessToken, createCalendarEvent } from "@/lib/google";

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

  const meetingId = id();
  await db
    .prepare(
      "INSERT INTO meetings (id, org_id, contact_id, deal_id, title, date, transcript, summary_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(
      meetingId,
      session.orgId,
      body.contactId,
      body.dealId || null,
      body.title,
      now(),
      body.transcript || body.agenda || null,
      JSON.stringify(summary),
      now()
    );

  // Next steps automatically become linked tasks, per spec. If Google
  // Calendar is connected, each dated one also becomes a real calendar event
  // — that's the concrete payoff of connecting Calendar in Settings.
  const googleAccessToken = await getValidGoogleAccessToken(session.orgId).catch(() => null);
  for (const step of summary.nextSteps) {
    await db
      .prepare(
        "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(id(), session.orgId, body.contactId, body.dealId || null, step.action, step.dueDate, 0, "medium", session.userId, now());

    if (googleAccessToken && step.dueDate) {
      const start = new Date(step.dueDate);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await createCalendarEvent(googleAccessToken, {
        summary: step.action,
        description: `Follow-up from meeting "${body.title}" with ${contact?.name || "contact"} — created automatically by Pearl.`,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      }).catch(() => {
        // Best-effort: a failed calendar sync never blocks saving the task.
      });
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
