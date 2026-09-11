import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createContact } from "@/lib/data";

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
