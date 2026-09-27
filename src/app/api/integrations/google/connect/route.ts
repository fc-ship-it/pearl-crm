import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildGoogleAuthUrl, getAppBaseUrl, isGoogleConfigured } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  if (!isGoogleConfigured()) {
    const url = new URL("/app/settings/integrations", req.url);
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const redirectUri = new URL("/api/integrations/google/callback", getAppBaseUrl(req.url)).toString();
  // `state` carries BOTH orgId and userId (dot-separated — neither id ever
  // contains a dot) so the callback below knows exactly which teammate's
  // personal connection to save this to, without relying on the session
  // cookie still being readable on Google's redirect back.
  const authUrl = buildGoogleAuthUrl(redirectUri, `${session.orgId}.${session.userId}`);
  return NextResponse.redirect(authUrl);
}
