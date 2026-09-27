import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setContactTemperature, setContactAddress, deleteContact, getContact, LEAD_TEMPERATURES } from "@/lib/data";

export const runtime = "nodejs";

const VALID_TEMPERATURES = new Set<string>(LEAD_TEMPERATURES);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // A "SALES" teammate can only edit their own contacts.
  if (session.role !== "ADMIN") {
    const owned = await getContact(session.orgId, id, session.userId);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if ("temperature" in body) {
    const temp = body.temperature;
    if (temp !== null && !VALID_TEMPERATURES.has(temp)) {
      return NextResponse.json({ error: "invalid temperature" }, { status: 400 });
    }
    await setContactTemperature(session.orgId, id, temp);
  }

  if ("address" in body) {
    if (body.address !== null && typeof body.address !== "string") {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    await setContactAddress(session.orgId, id, body.address);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  // A "SALES" teammate can only delete their own contacts.
  if (session.role !== "ADMIN") {
    const owned = await getContact(session.orgId, id, session.userId);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteContact(session.orgId, id);
  return NextResponse.json({ ok: true });
}
