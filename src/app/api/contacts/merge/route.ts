import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getContact, mergeContacts } from "@/lib/data";

export const runtime = "nodejs";

const schema = z.object({
  primaryId: z.string().min(1),
  duplicateIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  // A SALES teammate can only merge contacts they own — check every id
  // involved (primary + every duplicate), not just the primary, so a
  // tampered request can't fold someone else's contact history into one of
  // theirs or vice versa.
  if (session.role !== "ADMIN") {
    const allIds = [parsed.data.primaryId, ...parsed.data.duplicateIds];
    for (const id of allIds) {
      const owned = await getContact(session.orgId, id, session.userId);
      if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  await mergeContacts(session.orgId, parsed.data.primaryId, parsed.data.duplicateIds);
  return NextResponse.json({ ok: true });
}
