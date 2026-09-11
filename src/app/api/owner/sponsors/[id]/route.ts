import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSponsorActive, deleteSponsor } from "@/lib/data";

export const runtime = "nodejs";

const schema = z.object({ active: z.boolean() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  await setSponsorActive(id, parsed.data.active);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteSponsor(id);
  return NextResponse.json({ ok: true });
}
