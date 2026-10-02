import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findDuplicateContactGroups } from "@/lib/data";

export const runtime = "nodejs";

/** Possible-duplicate groups for the Contacts page's "Possibili duplicati"
 * panel — a SALES teammate only ever sees (and can later merge) duplicates
 * among contacts they own, same scoping as listContacts. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ownerId = session.role === "ADMIN" ? undefined : session.userId;
  const groups = await findDuplicateContactGroups(session.orgId, ownerId);
  return NextResponse.json({ groups });
}
