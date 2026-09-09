import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Dev-only fallback secret so `npm run dev` works with zero setup.
// README instructs setting a real AUTH_SECRET before any real deployment.
const secretString = process.env.AUTH_SECRET || "ahead-pearl-dev-secret-change-me-before-deploy";
const secret = new TextEncoder().encode(secretString);

export const SESSION_COOKIE = "pearl_session";

export type SessionPayload = {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  role: string;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---- Owner (AHEAD LLC platform operator) session ----------------------
// Separate from a tenant's SESSION_COOKIE: this is Federica/AHEAD LLC's own
// login to see and manage every organization that signs up for Pearl, not
// a customer's login into their own CRM data.
export const OWNER_SESSION_COOKIE = "pearl_owner_session";

export async function createOwnerSessionToken(): Promise<string> {
  return new SignJWT({ owner: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyOwnerSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.owner === true;
  } catch {
    return false;
  }
}

export async function getOwnerSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(OWNER_SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifyOwnerSessionToken(token);
}
