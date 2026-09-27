import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, createPasswordResetToken } from "@/lib/data";
import { sendPasswordResetEmail } from "@/lib/notify";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

// Always returns the same generic "ok" response whether or not the email
// has an account — otherwise this endpoint could be used to check which
// emails are registered on Pearl.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.data.email);
  // A deactivated teammate can't log in even after a reset, so don't send
  // one — but still return the same generic response either way.
  if (user && !user.deactivatedAt) {
    const rawToken = await createPasswordResetToken(user.id);
    await sendPasswordResetEmail({ contactEmail: parsed.data.email, contactName: user.name, rawToken }).catch(() => {
      // Best-effort: Resend not configured, or a transient failure — the
      // response is identical either way, per the comment above.
    });
  }

  return NextResponse.json({ ok: true });
}
