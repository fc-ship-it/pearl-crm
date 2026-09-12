import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deletePushSubscriptionByEndpoint } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.endpoint) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  await deletePushSubscriptionByEndpoint(body.endpoint);
  return NextResponse.json({ ok: true });
}
