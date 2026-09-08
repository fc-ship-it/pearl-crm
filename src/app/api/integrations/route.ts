import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setIntegration } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!["gmail", "whatsapp", "calendar"].includes(body.provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  setIntegration(session.orgId, body.provider, !!body.connected);
  return NextResponse.json({ ok: true });
}
