import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { savePushSubscription } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  await savePushSubscription(session.orgId, session.userId, body);
  return NextResponse.json({ ok: true });
}
