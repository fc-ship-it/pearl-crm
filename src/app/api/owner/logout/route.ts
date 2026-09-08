import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
