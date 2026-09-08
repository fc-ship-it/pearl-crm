// Real Google OAuth (Calendar + Gmail) — no googleapis package, just fetch,
// to keep the project's zero-heavy-dependency approach. One Google Cloud
// project (created once by AHEAD LLC) is the OAuth "app"; each Pearl
// customer connects their OWN Google account to it from Settings →
// Integrations. See README.md → "Collegare Google Calendar e Gmail" for the
// exact Google Cloud Console setup steps.

import { getIntegration, saveIntegrationCredentials } from "@/lib/data";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function isGoogleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

// Google requires the redirect_uri to be byte-for-byte identical to one of
// the URIs registered on the OAuth client, and to match on both the /connect
// request and the /callback token exchange. Building it from the incoming
// request's own URL (`req.url`) is NOT safe on Netlify: the Next.js Runtime
// invokes the function via internal/deploy-scoped hosts (e.g. a per-deploy
// "<id>--pearl-crm.netlify.app" or "main--pearl-crm.netlify.app"), so
// `req.url` doesn't reliably reflect the public custom domain — Google then
// rejects the request with redirect_uri_mismatch even though the app "looks"
// right. Instead we pin an explicit APP_URL env var (set on Netlify to
// https://pearl-crm.netlify.app) and only fall back to the request's own
// origin for local development, where APP_URL is normally unset.
export function getAppBaseUrl(requestUrl: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(requestUrl).origin;
}

export function buildGoogleAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

/** Completes the OAuth dance after Google redirects back with a `code`, and
 * stores the resulting tokens for BOTH the "gmail" and "calendar" rows — a
 * single Google account grants both scopes at once, matching how the two
 * integration cards in Settings behave in real life. */
export async function completeGoogleConnect(orgId: string, code: string, redirectUri: string) {
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const email = await getUserEmail(tokens.access_token);
  for (const provider of ["gmail", "calendar"]) {
    saveIntegrationCredentials(orgId, provider, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, // present only on first consent
      tokenExpiry: expiry,
      extra: email ? { email } : undefined,
    });
  }
  return email;
}

/** Returns a valid access token for the org's connected Google account,
 * refreshing it first if it has expired. Returns null if not connected. */
export async function getValidGoogleAccessToken(orgId: string): Promise<string | null> {
  const row = getIntegration(orgId, "calendar") || getIntegration(orgId, "gmail");
  if (!row || !row.connected || !row.access_token) return null;
  const expired = !row.token_expiry || new Date(row.token_expiry).getTime() <= Date.now() + 60_000;
  if (!expired) return row.access_token;
  if (!row.refresh_token) return row.access_token; // best effort — will fail upstream if truly expired
  const refreshed = await refreshAccessToken(row.refresh_token);
  const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  for (const provider of ["gmail", "calendar"]) {
    saveIntegrationCredentials(orgId, provider, { accessToken: refreshed.access_token, tokenExpiry: expiry });
  }
  return refreshed.access_token;
}

export async function createCalendarEvent(
  accessToken: string,
  event: { summary: string; description?: string; startISO: string; endISO: string; attendeeEmail?: string | null }
) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startISO },
      end: { dateTime: event.endISO },
      attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar event creation failed: ${await res.text()}`);
  return res.json();
}

function toBase64Url(str: string) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(accessToken: string, mail: { toEmail: string; subject: string; bodyText: string }) {
  const raw = toBase64Url(
    [`To: ${mail.toEmail}`, `Subject: ${mail.subject}`, "Content-Type: text/plain; charset=utf-8", "", mail.bodyText].join("\n")
  );
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
  return res.json();
}
