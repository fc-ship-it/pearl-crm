import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audienceForSegment } from "@/lib/data";

export const runtime = "nodejs";

// Live "N recipients" preview while drafting a campaign, before it's saved.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const audience = audienceForSegment(session.orgId, {
    interest: body.interest || undefined,
    budgetTier: body.budgetTier || undefined,
    targetSegment: body.targetSegment || undefined,
  });

  return NextResponse.json({ count: audience.length, names: audience.slice(0, 5).map((c) => c.name) });
}
