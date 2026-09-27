import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/google";
import { completeOutlookConnect } from "@/lib/outlook";

export const runtime = "nodejs";

// Microsoft redirects the user's browser here after they approve (or
// decline) access — `state` carries the orgId we passed in at /connect so we
// know whose integration to save it against, since there's no logged-in-user
// context on this GET request from Microsoft's side. Mirrors the Google
// callback route exactly.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const settingsUrl = new URL("/app/settings/integrations", req.url);

  // state = "<orgId>.<userId>" — see /connect above.
  const [orgId, userId] = state ? state.split(".") : [null, null];

  if (error || !code || !orgId || !userId) {
    settingsUrl.searchParams.set("error", error || "outlook_missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = new URL("/api/integrations/outlook/callback", getAppBaseUrl(req.url)).toString();
    await completeOutlookConnect(orgId, userId, code, redirectUri);
    settingsUrl.searchParams.set("connected", "outlook");
  } catch {
    settingsUrl.searchParams.set("error", "outlook_token_exchange_failed");
  }
  return NextResponse.redirect(settingsUrl);
}
