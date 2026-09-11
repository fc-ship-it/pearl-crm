import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordFeatureInterest } from "@/lib/data";

export const runtime = "nodejs";

const VALID_ANSWERS = new Set(["yes", "maybe", "no"]);

/** Records one user's answer to the dashboard's one-click product-interest
 * banner ("would a Real Estate CRM module interest you?"). See
 * feature_interest_responses in db.ts — deliberately its own tiny table,
 * separate from anything else, since this is pure product-validation
 * signal for AHEAD LLC, not a CRM record. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const answer = body?.answer;
  if (!VALID_ANSWERS.has(answer)) return NextResponse.json({ error: "invalid answer" }, { status: 400 });

  await recordFeatureInterest({ orgId: session.orgId, userId: session.userId, answer });
  return NextResponse.json({ ok: true });
}
