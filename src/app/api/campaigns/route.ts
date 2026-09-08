import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audienceForSegment, createCampaign } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.message?.trim()) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }

  const segment = {
    interest: body.interest || undefined,
    budgetTier: body.budgetTier || undefined,
    targetSegment: body.targetSegment || undefined,
  };

  const campaign = createCampaign(session.orgId, {
    title: body.title,
    message: body.message,
    channel: body.channel === "email" ? "email" : "whatsapp",
    segment,
  });

  return NextResponse.json({ ok: true, campaign, audienceCount: audienceForSegment(session.orgId, segment).length });
}
