import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setContactTemperature, LEAD_TEMPERATURES } from "@/lib/data";

export const runtime = "nodejs";

const VALID_TEMPERATURES = new Set<string>(LEAD_TEMPERATURES);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if ("temperature" in body) {
    const temp = body.temperature;
    if (temp !== null && !VALID_TEMPERATURES.has(temp)) {
      return NextResponse.json({ error: "invalid temperature" }, { status: 400 });
    }
    setContactTemperature(session.orgId, id, temp);
  }

  return NextResponse.json({ ok: true });
}
