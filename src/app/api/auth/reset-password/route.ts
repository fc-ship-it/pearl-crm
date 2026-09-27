import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePasswordResetToken } from "@/lib/data";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const ok = await consumePasswordResetToken(parsed.data.token, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
