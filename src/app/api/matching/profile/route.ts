import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateMatchProfile } from "@/lib/data";

export const runtime = "nodejs";

// Saves the caller's own org "Business Match" card. Deliberately org-scoped
// (session.orgId only, never a body-supplied org id) so one tenant can never
// write another tenant's directory listing.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const optIn = !!body.optIn;
  if (optIn) {
    // Require at least the essentials before letting an org appear in
    // other tenants' directory — an empty card opted in helps no one and
    // just looks broken to whoever finds it.
    if (!body.headline?.trim() || !body.offering?.trim() || !body.lookingFor?.trim()) {
      return NextResponse.json(
        { error: "Compila almeno titolo, cosa offri e cosa cerchi prima di attivare la visibilità." },
        { status: 400 }
      );
    }
  }

  await updateMatchProfile(session.orgId, {
    optIn,
    headline: body.headline || "",
    sector: body.sector || "",
    offering: body.offering || "",
    lookingFor: body.lookingFor || "",
    contactEmail: body.contactEmail || "",
    contactPhone: body.contactPhone || "",
  });

  return NextResponse.json({ ok: true });
}
