import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setUserStatisticsWidgets } from "@/lib/data";
import { DEFAULT_STATISTICS_WIDGET_IDS } from "@/lib/domain";

export const runtime = "nodejs";

/** Saves which Statistics-page cards this user wants to see, and in what
 * order — per-user, so an ADMIN and a SALES teammate on the same account can
 * each keep their own layout. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const widgetIds = Array.isArray(body?.widgetIds) ? body.widgetIds.filter((x: unknown) => typeof x === "string") : null;
  if (!widgetIds) {
    return NextResponse.json({ error: "widgetIds must be an array of strings." }, { status: 400 });
  }
  const known = new Set(DEFAULT_STATISTICS_WIDGET_IDS as string[]);
  const cleaned = widgetIds.filter((id: string) => known.has(id));

  await setUserStatisticsWidgets(session.userId, cleaned);
  return NextResponse.json({ ok: true });
}
