import { NextRequest, NextResponse } from "next/server";
import { completeGoogleConnect, getAppBaseUrl } from "@/lib/google";

export const runtime = "nodejs";

// Google redirects the user's browser here after they approve (or decline)
// access — `state` carries the orgId we passed in at /connect so we know
// whose integration to save it against, since there's no logged-in-user
// context on this GET request from Google's side.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const settingsUrl = new URL("/app/settings/integrations", req.url);

  // state = "<orgId>.<userId>" — see /connect above.
  const [orgId, userId] = state ? state.split(".") : [null, null];

  if (error || !code || !orgId || !userId) {
    settingsUrl.searchParams.set("error", error || "google_missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = new URL("/api/integrations/google/callback", getAppBaseUrl(req.url)).toString();
    await completeGoogleConnect(orgId, userId, code, redirectUri);
    settingsUrl.searchParams.set("connected", "google");
  } catch {
    settingsUrl.searchParams.set("error", "google_token_exchange_failed");
  }
  return NextResponse.redirect(settingsUrl);
}
