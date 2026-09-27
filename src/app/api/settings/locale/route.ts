import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setUserLocale } from "@/lib/data";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";

/** Saves the caller's own language preference — per-user, not per-org, so
 * two teammates on the same account can each read Pearl in their own
 * language. Called by <LanguageSwitcher> right before it does
 * router.refresh() so server-rendered pages pick up the new locale. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!isLocale(body?.locale)) {
    return NextResponse.json({ error: "Invalid locale." }, { status: 400 });
  }

  await setUserLocale(session.userId, body.locale);
  return NextResponse.json({ ok: true });
}
