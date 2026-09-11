import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createContact, deleteContacts } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const contact = await createContact(session.orgId, {
    name: body.name,
    email: body.email || null,
    phone: body.phone || null,
    companyName: body.companyName || null,
    interest: body.interest || null,
    budgetTier: body.budgetTier || null,
    targetSegment: body.targetSegment || null,
    source: body.source || "manual",
    ownerId: session.userId,
  });

  return NextResponse.json({ ok: true, contact });
}

// Bulk delete — the "select many, delete" action in the contacts list. Takes
// { ids: string[] } rather than one id per request so that deleting a batch
// of thousands of contacts (e.g. an entire phone's address book imported by
// mistake) is one request instead of thousands of round-trips.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No contact ids provided." }, { status: 400 });
  }

  const deleted = await deleteContacts(session.orgId, ids);
  return NextResponse.json({ ok: true, deleted });
}
