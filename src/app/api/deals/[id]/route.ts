import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateDealStage, getDeal } from "@/lib/data";
import { STAGES } from "@/lib/domain";

export const runtime = "nodejs";

const VALID_STAGES = new Set(STAGES.map((s) => s.id));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!VALID_STAGES.has(body.stage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }
  // A "SALES" teammate can only move their own deals — getDeal returns null
  // (and this 404s) if they don't own it.
  if (session.role !== "ADMIN") {
    const owned = await getDeal(session.orgId, id, session.userId);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await updateDealStage(session.orgId, id, body.stage);
  return NextResponse.json({ ok: true });
}
