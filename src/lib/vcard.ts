// Minimal vCard (RFC 6350 / the older 2.1 & 3.0 dialects Android and iOS both
// still export) reader, plus a small classifier for whatever text a QR code
// scan turns up (a vCard, a WhatsApp "click to chat" link, a bare phone
// number, or something else). No dependency: the format is simple line-based
// text and a full RFC parser would be overkill for "read a name/phone/email
// out of a contact export".

export type ParsedContact = {
  name: string;
  email: string | null;
  phone: string | null;
  org: string | null;
};

/** Splits a .vcf export (Android and iOS both produce one or more concatenated VCARD blocks) into individual contacts. */
export function parseVCardFile(text: string): ParsedContact[] {
  const blocks = text.split(/BEGIN:VCARD/i).slice(1);
  return blocks
    .map((block) => parseVCardBlock("BEGIN:VCARD" + block))
    .filter((c): c is ParsedContact => c !== null);
}

function unfoldLines(text: string): string[] {
  // vCard lines can be "folded" (continued on the next line with a leading space/tab).
  const raw = text.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseVCardBlock(block: string): ParsedContact | null {
  const lines = unfoldLines(block);
  let fn: string | null = null;
  let n: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let org: string | null = null;

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1).trim();
    const key = rawKey.split(";")[0].toUpperCase();
    if (key === "FN") fn = value;
    else if (key === "N") n = value;
    else if (key === "EMAIL" && !email) email = value;
    else if (key === "TEL" && !phone) phone = value;
    else if (key === "ORG" && !org) org = value.replace(/;/g, " ").trim();
  }

  let name = fn;
  if (!name && n) {
    // N is Family;Given;Middle;Prefix;Suffix
    const parts = n.split(";").filter(Boolean);
    name = [parts[1], parts[0]].filter(Boolean).join(" ");
  }
  if (!name && !email && !phone) return null;
  return { name: name || email || phone || "Unnamed contact", email, phone, org };
}

export type QrPayload =
  | { kind: "vcard"; contact: ParsedContact }
  | { kind: "whatsapp"; phone: string }
  | { kind: "whatsapp-opaque" }
  | { kind: "phone"; phone: string }
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

/** Classifies whatever raw text a QR scan decoded to, so the "add contact" flow can react appropriately. */
export function classifyQrPayload(raw: string): QrPayload {
  const text = raw.trim();

  if (/^BEGIN:VCARD/i.test(text)) {
    const contact = parseVCardBlock(text);
    if (contact) return { kind: "vcard", contact };
  }

  // WhatsApp "click to chat" links carry the phone number in the URL itself.
  const waMe = text.match(/wa\.me\/(?:qr\/)?(\d{6,15})/i);
  const waApi = text.match(/[?&]phone=(\d{6,15})/i);
  if (waMe && !/\/qr\//i.test(text)) return { kind: "whatsapp", phone: waMe[1] };
  if (waApi) return { kind: "whatsapp", phone: waApi[1] };
  if (/wa\.me\/qr\//i.test(text) || /chat\.whatsapp\.com/i.test(text)) {
    // WhatsApp's own "My code" personal QR is an opaque short link that only
    // resolves inside the WhatsApp app — it doesn't embed the number, so it
    // can't be decoded client-side.
    return { kind: "whatsapp-opaque" };
  }

  const barePhone = text.match(/^\+?[\d\s().-]{6,20}$/);
  if (barePhone) return { kind: "phone", phone: text.replace(/[\s().-]/g, "") };

  if (/^https?:\/\//i.test(text)) return { kind: "url", url: text };

  return { kind: "text", text };
}
