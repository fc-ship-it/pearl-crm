import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCustomAlert, listCustomAlerts, ALERT_KINDS, type AlertKind } from "@/lib/data";

export const runtime = "nodejs";

const VALID_KINDS = new Set<string>(ALERT_KINDS);

// Polled client-side (see ReminderNotifier) to drive in-browser notifications
// for due calls/appointments/reminders — only open ones are needed for that.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const alerts = listCustomAlerts(session.orgId, { onlyOpen: true });
  return NextResponse.json({ alerts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.remindAt) {
    return NextResponse.json({ error: "Title and reminder date are required." }, { status: 400 });
  }
  const kind: AlertKind = VALID_KINDS.has(body.kind) ? body.kind : "general";

  const alert = createCustomAlert(
    session.orgId,
    body.title,
    new Date(body.remindAt).toISOString(),
    kind,
    body.contactId || null
  );
  return NextResponse.json({ ok: true, alert });
}
