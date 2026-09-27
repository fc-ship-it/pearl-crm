import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toggleTask } from "@/lib/data";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // A "SALES" teammate can only toggle their own tasks.
  if (session.role !== "ADMIN") {
    const owned = await db.prepare("SELECT id FROM tasks WHERE org_id = ? AND id = ? AND owner_id = ?").get(session.orgId, id, session.userId);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await toggleTask(session.orgId, id, !!body.done);
  return NextResponse.json({ ok: true });
}
