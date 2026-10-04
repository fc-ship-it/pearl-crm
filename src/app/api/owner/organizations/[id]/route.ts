import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extendTrial, grantManualPlan, resetOrgBillingCurrency, getOrganization, getOrgBillingContactEmail } from "@/lib/data";
import { BILLING_PLANS, type BillingIntervalId } from "@/lib/domain";
import { sendWelcomeEmail } from "@/lib/notify";

export const runtime = "nodejs";

const VALID_INTERVALS = BILLING_PLANS.map((p) => p.id) as [string, ...string[]];

const schema = z.object({
  action: z.enum(["extend_trial", "grant_plan", "resend_welcome", "reset_currency"]),
  days: z.number().int().positive().optional(),
  plan: z.enum(VALID_INTERVALS).optional(),
});

/** Owner-only admin actions on a customer org: extend the trial, manually
 * grant a paid plan for a customer who paid AHEAD LLC directly (bank
 * transfer, cash, a Ziina transfer outside the in-app checkout — see
 * grantManualPlan in src/lib/data.ts for what that does), or manually
 * re-trigger the welcome email — for a signup whose original email got lost
 * to Resend's sandbox-mode restriction (see notify.ts) before the sending
 * domain was verified. This never touches billing/subscription state, so
 * it's safe to use on a customer who already paid and is already inside. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.action === "extend_trial") {
    await extendTrial(orgId, parsed.data.days ?? 14);
  } else if (parsed.data.action === "grant_plan" && parsed.data.plan) {
    await grantManualPlan(orgId, parsed.data.plan as BillingIntervalId);
  } else if (parsed.data.action === "reset_currency") {
    await resetOrgBillingCurrency(orgId);
  } else if (parsed.data.action === "resend_welcome") {
    const org = await getOrganization(orgId);
    if (!org) return NextResponse.json({ error: "Organizzazione non trovata." }, { status: 404 });
    const email = await getOrgBillingContactEmail(orgId);
    if (!email) return NextResponse.json({ error: "Nessun utente trovato per questa organizzazione." }, { status: 400 });
    const sent = await sendWelcomeEmail({ contactName: "there", contactEmail: email, orgName: org.name });
    if (!sent) {
      return NextResponse.json(
        { error: `Resend non ha consegnato l'email a ${email} (dominio non ancora verificato o non configurato — vedi i log).` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, email });
  }
  return NextResponse.json({ ok: true });
}
