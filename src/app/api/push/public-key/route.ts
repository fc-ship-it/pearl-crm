import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const publicKey = getVapidPublicKey();
  if (!publicKey) return NextResponse.json({ error: "Push non ancora configurato." }, { status: 503 });
  return NextResponse.json({ publicKey });
}
