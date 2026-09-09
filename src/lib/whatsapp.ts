// Real WhatsApp Business sending via Meta's Cloud API. Unlike Google, there's
// no OAuth dance here for an MVP: the merchant pastes their own permanent
// access token + phone number ID (both come from the Meta for Developers
// dashboard once their WhatsApp Business Account is approved) directly into
// Settings → Integrations. This is the same "paste your API key" pattern
// most CRMs use for WhatsApp before building the heavier Embedded Signup
// flow. See README.md → "Collegare WhatsApp Business" for the exact steps
// (including the Meta business-verification wait, which nothing here can
// skip).

import { getIntegration, saveIntegrationCredentials } from "@/lib/data";

const GRAPH_VERSION = "v21.0";

export type WhatsAppCreds = { token: string; phoneNumberId: string };

export function getWhatsAppCreds(orgId: string): WhatsAppCreds | null {
  const row = getIntegration(orgId, "whatsapp");
  if (!row || !row.connected || !row.access_token || !row.extra) return null;
  try {
    const extra = JSON.parse(row.extra) as { phoneNumberId?: string };
    if (!extra.phoneNumberId) return null;
    return { token: row.access_token, phoneNumberId: extra.phoneNumberId };
  } catch {
    return null;
  }
}

/** Verifies the token/phone number actually work before we mark the
 * integration as connected, so a typo doesn't silently "succeed". */
export async function verifyWhatsAppCredentials(token: string, phoneNumberId: string): Promise<{ ok: boolean; displayNumber?: string; error?: string }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || `HTTP ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, displayNumber: data.display_phone_number };
}

export function saveWhatsAppCredentials(orgId: string, token: string, phoneNumberId: string, displayNumber?: string) {
  saveIntegrationCredentials(orgId, "whatsapp", {
    accessToken: token,
    extra: { phoneNumberId, displayNumber },
  });
}

/** Sends a free-form text message. Note: Meta only allows free-form text
 * within 24h of the customer's last message to you ("customer service
 * window"); outside that window a pre-approved message TEMPLATE is
 * required. Pearl sends free-form text here — fine for replying to an
 * active conversation, not guaranteed for cold outbound at scale. See the
 * README caveat before relying on this for campaigns. */
export async function sendWhatsAppMessage(creds: WhatsAppCreds, toPhoneE164: string, bodyText: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhoneE164.replace(/[^\d+]/g, ""),
      type: "text",
      text: { body: bodyText },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${await res.text()}`);
  return res.json();
}
