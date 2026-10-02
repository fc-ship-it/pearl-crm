import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPromoCodes, createPromoCode } from "@/lib/data";

export const runtime = "nodejs";

// Auth: /api/owner/* is gated centrally by src/proxy.ts (owner session
// cookie) — no separate check needed here, same as the other owner routes.

const schema = z.object({
  code: z.string().trim().min(2),
  bonusDays: z.number().int().positive(),
  note: z.string().trim().optional(),
  // Empty/omitted = unlimited redemptions.
  maxRedemptions: z.number().int().positive().optional(),
});

export async function GET() {
  const codes = await listPromoCodes();
  return NextResponse.json({ codes });
}

/** Creates a free-access promo code — entered at signup instead of a card
 * (see redeemPromoCode in data.ts). Used for things like giving a test team
 * member free access for a few months, without touching Stripe at all. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  try {
    await createPromoCode(parsed.data);
  } catch {
    // Most likely the UNIQUE(code) constraint — the code is already taken.
    return NextResponse.json({ error: "Questo codice esiste già." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
