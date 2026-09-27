import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/google";
import { buildOutlookAuthUrl, isOutlookConfigured } from "@/lib/outlook";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  if (!isOutlookConfigured()) {
    const url = new URL("/app/settings/integrations", req.url);
    url.searchParams.set("error", "outlook_not_configured");
    return NextResponse.redirect(url);
  }

  const redirectUri = new URL("/api/integrations/outlook/callback", getAppBaseUrl(req.url)).toString();
  // Same "orgId.userId" state pattern as the Google /connect route.
  const authUrl = buildOutlookAuthUrl(redirectUri, `${session.orgId}.${session.userId}`);
  return NextResponse.redirect(authUrl);
}
