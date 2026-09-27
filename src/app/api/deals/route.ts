import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createDeal, listDeals } from "@/lib/data";
import { STAGES } from "@/lib/domain";

export const runtime = "nodejs";

const VALID_STAGES = new Set<string>(STAGES.map((s) => s.id));

/** Lightweight lookup used by pickers (the quick-add "+" menu's Task form,
 * to attach a task to a deal). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const viewerOwnerId = session.role === "ADMIN" ? undefined : session.userId;
  const deals = await listDeals(session.orgId, viewerOwnerId);
  return NextResponse.json({ deals: deals.map((d) => ({ id: d.id, title: d.title, contactName: d.contactName })) });
}

/** Creates a new deal by hand — until this route existed, every deal in the
 * app came from the demo seed data with no way for a real customer to add
 * their own. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "Value must be a positive number." }, { status: 400 });
  if (body.stage && !VALID_STAGES.has(body.stage)) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  const deal = await createDeal(session.orgId, {
    title: body.title,
    value,
    contactId: body.contactId || null,
    stage: body.stage || "lead",
    ownerId: session.userId,
    expectedCloseDate: body.expectedCloseDate || null,
  });

  return NextResponse.json({ ok: true, deal });
}
