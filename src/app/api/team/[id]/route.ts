import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deactivateTeamMember, reactivateTeamMember, updateTeamMemberRole } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can manage the team." }, { status: 403 });
  }
  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json({ error: "You can't change your own access from here." }, { status: 400 });
  }

  // Every mutation below is already scoped to `WHERE org_id = ? AND id = ?`,
  // so a stale or cross-org id just quietly matches zero rows rather than
  // leaking whether that id exists anywhere else.
  const body = await req.json().catch(() => ({}));
  if (body.action === "deactivate") {
    await deactivateTeamMember(session.orgId, id);
  } else if (body.action === "reactivate") {
    await reactivateTeamMember(session.orgId, id);
  } else if (body.action === "setRole" && (body.role === "ADMIN" || body.role === "SALES")) {
    await updateTeamMemberRole(session.orgId, id, body.role);
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
