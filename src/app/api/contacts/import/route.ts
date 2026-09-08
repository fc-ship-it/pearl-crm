import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { importContacts, type NewContactInput } from "@/lib/data";

export const runtime = "nodejs";

// Contacts are parsed client-side (the vCard export from Android/iOS, or a
// scanned QR code, is read in the browser — see src/lib/vcard.ts, which is
// framework-free and shared by both the client parsing step and this route's
// types) and posted here already structured, so this route just validates
// and writes them.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const contacts: NewContactInput[] = Array.isArray(body?.contacts) ? body.contacts : [];
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts to import." }, { status: 400 });
  }

  const result = importContacts(
    session.orgId,
    contacts.map((c) => ({
      name: c.name,
      email: c.email || null,
      phone: c.phone || null,
      companyName: c.companyName || null,
      interest: c.interest || null,
      budgetTier: c.budgetTier || null,
      targetSegment: c.targetSegment || null,
      source: c.source || "import",
      ownerId: session.userId,
    }))
  );

  return NextResponse.json({ ok: true, ...result });
}
