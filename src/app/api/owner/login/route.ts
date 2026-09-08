import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOwnerSessionToken, OWNER_SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// Dev-only fallback so `npm run dev` works with zero setup. Set OWNER_PASSWORD
// before any real deployment — see README.
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "pearl-owner-dev-password";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }
  if (parsed.data.password !== OWNER_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await createOwnerSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
