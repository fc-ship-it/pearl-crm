import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateDealStage } from "@/lib/data";
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
  await updateDealStage(session.orgId, id, body.stage);
  return NextResponse.json({ ok: true });
}
