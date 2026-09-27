// Real Microsoft OAuth (Outlook Mail + Outlook Calendar) via the Microsoft
// identity platform + Microsoft Graph — no MSAL/Graph SDK package, just
// fetch, matching the same zero-heavy-dependency approach used for Google in
// google.ts. One Azure AD app registration (created once by AHEAD LLC) is
// the OAuth "app"; each Pearl customer connects their OWN Outlook/Microsoft
// 365 account to it from Settings → Integrations. See README.md → "Outlook /
// Microsoft" for the exact Azure Portal setup steps.
//
// Structured to mirror google.ts function-for-function so the two providers
// stay easy to compare and so a Pearl org can have BOTH a Gmail account and
// an Outlook account connected at the same time — they're independent rows
// in the `integrations` table ("gmail"/"calendar" vs "outlook_mail"/
// "outlook_calendar"), never mutually exclusive.

import { getIntegration, saveIntegrationCredentials, getUserIntegration, saveUserIntegrationCredentials } from "@/lib/data";

// "common" accepts both personal Microsoft accounts and any work/school
// (Azure AD) tenant — the right choice for a multi-tenant SaaS like Pearl,
// where each customer brings their own Microsoft 365 org.
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/User.Read",
].join(" ");

export function isOutlookConfigured() {
  return !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET;
}

export function buildOutlookAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
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
      client_id: process.env.MICROSOFT_CLIENT_ID || "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID || "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  // Microsoft rotates the refresh token on every use — the response's own
  // refresh_token (when present) must replace the stored one, or the next
  // refresh will fail.
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.mail ?? data.userPrincipalName ?? null;
}

/** Completes the OAuth dance after Microsoft redirects back with a `code`,
 * and stores the resulting tokens for BOTH the "outlook_mail" and
 * "outlook_calendar" rows, scoped to the ONE teammate (userId) who just
 * connected — a single Microsoft account grants both scopes at once, and
 * each teammate in an org connects their own account independently (same
 * per-user pattern as Google — see user_integrations in src/lib/db.ts and
 * Settings -> Team). */
export async function completeOutlookConnect(orgId: string, userId: string, code: string, redirectUri: string) {
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const email = await getUserEmail(tokens.access_token);
  for (const provider of ["outlook_mail", "outlook_calendar"]) {
    await saveUserIntegrationCredentials(orgId, userId, provider, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, // present only on first consent
      tokenExpiry: expiry,
      extra: email ? { email } : undefined,
    });
  }
  return email;
}

/** Returns a valid access token for this ONE teammate's connected Outlook
 * account, refreshing it first if it has expired. Falls back to the org-wide
 * "outlook_mail"/"outlook_calendar" row when this specific user hasn't
 * personally connected one, same fallback logic as getValidGoogleAccessToken
 * in google.ts. Returns null if neither is connected. */
export async function getValidOutlookAccessToken(orgId: string, userId: string): Promise<string | null> {
  const row =
    (await getUserIntegration(userId, "outlook_mail")) ||
    (await getUserIntegration(userId, "outlook_calendar")) ||
    (await getIntegration(orgId, "outlook_mail")) ||
    (await getIntegration(orgId, "outlook_calendar"));
  if (!row || !row.connected || !row.access_token) return null;
  const expired = !row.token_expiry || new Date(row.token_expiry).getTime() <= Date.now() + 60_000;
  if (!expired) return row.access_token;
  if (!row.refresh_token) return row.access_token; // best effort — will fail upstream if truly expired
  const refreshed = await refreshAccessToken(row.refresh_token);
  const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const hasOwnConnection = await getUserIntegration(userId, "outlook_mail");
  for (const provider of ["outlook_mail", "outlook_calendar"]) {
    if (hasOwnConnection) {
      await saveUserIntegrationCredentials(orgId, userId, provider, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiry: expiry,
      });
    } else {
      await saveIntegrationCredentials(orgId, provider, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiry: expiry,
      });
    }
  }
  return refreshed.access_token;
}

export async function createOutlookCalendarEvent(
  accessToken: string,
  event: { summary: string; description?: string; startISO: string; endISO: string; attendeeEmail?: string | null }
) {
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: event.summary,
      body: event.description ? { contentType: "text", content: event.description } : undefined,
      start: { dateTime: event.startISO, timeZone: "UTC" },
      end: { dateTime: event.endISO, timeZone: "UTC" },
      attendees: event.attendeeEmail
        ? [{ emailAddress: { address: event.attendeeEmail }, type: "required" }]
        : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Outlook Calendar event creation failed: ${await res.text()}`);
  return res.json();
}

export async function sendOutlookMail(accessToken: string, mail: { toEmail: string; subject: string; bodyText: string }) {
  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: { contentType: "text", content: mail.bodyText },
        toRecipients: [{ emailAddress: { address: mail.toEmail } }],
      },
      saveToSentItems: true,
    }),
  });
  // Microsoft Graph returns 202 Accepted with an empty body on success.
  if (!res.ok) throw new Error(`Outlook mail send failed: ${await res.text()}`);
}
