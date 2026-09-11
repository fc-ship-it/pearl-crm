import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAllSponsors, createSponsor } from "@/lib/data";

export const runtime = "nodejs";

// Auth: /api/owner/* is gated centrally by src/proxy.ts (owner session
// cookie) — no separate check needed here, same as the other owner routes.

const schema = z.object({
  name: z.string().min(1),
  headline: z.string().default(""),
  sector: z.string().default(""),
  offering: z.string().default(""),
  lookingFor: z.string().default(""),
  contactEmail: z.string().default(""),
  contactPhone: z.string().default(""),
});

export async function GET() {
  const sponsors = await listAllSponsors();
  return NextResponse.json({ sponsors });
}

/** Adds an external "sponsor" listing to the Business Match directory —
 * monetization point #4. These are commercial placements AHEAD LLC sells
 * directly and manages by hand here; the sponsor never gets a Pearl login. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  const id = await createSponsor(parsed.data);
  return NextResponse.json({ ok: true, id });
}
