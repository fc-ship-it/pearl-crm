import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extendTrial, grantManualPlan } from "@/lib/data";
import { BILLING_PLANS, type BillingIntervalId } from "@/lib/domain";

export const runtime = "nodejs";

const VALID_INTERVALS = BILLING_PLANS.map((p) => p.id) as [string, ...string[]];

const schema = z.object({
  action: z.enum(["extend_trial", "grant_plan"]),
  days: z.number().int().positive().optional(),
  plan: z.enum(VALID_INTERVALS).optional(),
});

/** Owner-only admin actions on a customer org: extend the trial, or
 * manually grant a paid plan for a customer who paid AHEAD LLC directly
 * (bank transfer, cash, a Ziina transfer outside the in-app checkout) —
 * see grantManualPlan in src/lib/data.ts for what that does. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.action === "extend_trial") {
    await extendTrial(orgId, parsed.data.days ?? 14);
  } else if (parsed.data.action === "grant_plan" && parsed.data.plan) {
    await grantManualPlan(orgId, parsed.data.plan as BillingIntervalId);
  }
  return NextResponse.json({ ok: true });
}
