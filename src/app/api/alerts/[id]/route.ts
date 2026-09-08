import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toggleCustomAlert } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  toggleCustomAlert(session.orgId, id, !!body.done);
  return NextResponse.json({ ok: true });
}
