import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setIntegration, getUserIntegration, disconnectUserIntegration } from "@/lib/data";

export const runtime = "nodejs";

const OAUTH_PROVIDERS = ["gmail", "calendar", "outlook_mail", "outlook_calendar"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (![...OAUTH_PROVIDERS, "whatsapp"].includes(body.provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }

  if (OAUTH_PROVIDERS.includes(body.provider)) {
    // Gmail/Calendar/Outlook are per-teammate (see user_integrations) — this
    // always clears THIS user's own connection. If they never personally
    // connected one and were only riding the org-wide legacy row (from
    // before Settings -> Team existed), clear that instead so the card
    // actually flips to "not connected" for them.
    const ownRow = await getUserIntegration(session.userId, body.provider);
    if (ownRow) {
      await disconnectUserIntegration(session.userId, body.provider);
    } else {
      await setIntegration(session.orgId, body.provider, false);
    }
  } else {
    // WhatsApp stays org-wide — one shared company number for the whole team.
    await setIntegration(session.orgId, body.provider, !!body.connected);
  }
  return NextResponse.json({ ok: true });
}
