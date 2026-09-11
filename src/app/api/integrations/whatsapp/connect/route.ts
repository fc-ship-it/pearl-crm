import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { verifyWhatsAppCredentials, saveWhatsAppCredentials } from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(10),
  phoneNumberId: z.string().min(3),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Inserisci sia il token che il Phone Number ID." }, { status: 400 });

  const check = await verifyWhatsAppCredentials(parsed.data.token, parsed.data.phoneNumberId);
  if (!check.ok) {
    return NextResponse.json({ error: "Meta ha rifiutato queste credenziali. Controlla token e Phone Number ID." }, { status: 400 });
  }

  await saveWhatsAppCredentials(session.orgId, parsed.data.token, parsed.data.phoneNumberId, check.displayNumber);
  return NextResponse.json({ ok: true, displayNumber: check.displayNumber });
}
