import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, id, now } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { notifyOwnerOfSignup, sendWelcomeEmail } from "@/lib/notify";

export const runtime = "nodejs";

const schema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }
  const { orgName, name, email, password } = parsed.data;

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const trialDays = 7;
  const trialEnds = new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString();

  const orgId = id();
  db.prepare(
    "INSERT INTO organizations (id, name, plan, trial_ends_at, promo_bonus_days, created_at) VALUES (?,?,?,?,?,?)"
  ).run(orgId, orgName, "trial", trialEnds, 0, now());

  const userId = id();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(userId, orgId, name, email, passwordHash, "ADMIN", now());

  for (const provider of ["gmail", "whatsapp", "calendar"]) {
    db.prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)").run(
      id(),
      orgId,
      provider,
      0,
      null
    );
  }

  // Fire-and-forget: never block or fail signup on either notification.
  notifyOwnerOfSignup({ orgName, contactName: name, contactEmail: email });
  sendWelcomeEmail({ orgName, contactName: name, contactEmail: email });

  const token = await createSessionToken({ userId, orgId, name, email, role: "ADMIN" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
