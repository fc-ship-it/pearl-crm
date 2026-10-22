import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setPromoCodeActive, updatePromoCodeLimits } from "@/lib/data";

export const runtime = "nodejs";

// Any combination of: toggle active, change the usage cap (null = unlimited),
// zero the usage counter.
const schema = z
  .object({
    active: z.boolean().optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    resetCount: z.boolean().optional(),
  })
  .refine((v) => v.active !== undefined || v.maxRedemptions !== undefined || v.resetCount !== undefined, {
    message: "Nessuna modifica richiesta.",
  });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  if (parsed.data.active !== undefined) await setPromoCodeActive(id, parsed.data.active);
  if (parsed.data.maxRedemptions !== undefined || parsed.data.resetCount) {
    await updatePromoCodeLimits(id, { maxRedemptions: parsed.data.maxRedemptions, resetCount: parsed.data.resetCount });
  }
  return NextResponse.json({ ok: true });
}
