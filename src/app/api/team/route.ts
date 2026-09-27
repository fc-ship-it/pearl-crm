import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTeamMember, EmailAlreadyExistsError, listOrgUsers } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ members: await listOrgUsers(session.orgId) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can add teammates." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "ADMIN" ? "ADMIN" : "SALES";

  if (!name || !email || !email.includes("@")) {
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  try {
    const member = await createTeamMember(session.orgId, { name, email, password, role });
    return NextResponse.json({ ok: true, member });
  } catch (e) {
    if (e instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("createTeamMember failed", e);
    return NextResponse.json({ error: "Couldn't add this teammate. Please try again." }, { status: 500 });
  }
}
