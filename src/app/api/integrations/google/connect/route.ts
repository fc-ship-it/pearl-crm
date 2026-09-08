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
  const authUrl = buildGoogleAuthUrl(redirectUri, session.orgId);
  return NextResponse.redirect(authUrl);
}
