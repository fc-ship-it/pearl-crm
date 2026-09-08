import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE, OWNER_SESSION_COOKIE } from "@/lib/auth";

const secretString = process.env.AUTH_SECRET || "ahead-pearl-dev-secret-change-me-before-deploy";
const secret = new TextEncoder().encode(secretString);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Owner area (AHEAD LLC's own view of every signup) — separate session,
  // separate login page, never mixed with a tenant's /app session.
  if (pathname.startsWith("/owner") && pathname !== "/owner/login") {
    const token = req.cookies.get(OWNER_SESSION_COOKIE)?.value;
    if (!token || !(await isValid(token))) {
      const url = req.nextUrl.clone();
      url.pathname = "/owner/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/owner") && pathname !== "/api/owner/login") {
    const token = req.cookies.get(OWNER_SESSION_COOKIE)?.value;
    if (!token || !(await isValid(token))) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!pathname.startsWith("/app")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

async function isValid(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.owner === true;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/app/:path*", "/owner/:path*", "/api/owner/:path*"],
};
