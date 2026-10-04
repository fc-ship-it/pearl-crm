import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAttachment, getContact, getDeal, getMeeting, listAttachments, updateAttachmentTranscription } from "@/lib/data";
import { ATTACHMENT_MAX_BYTES } from "@/lib/domain";
import { transcribeErrorMessage, transcribeNotePhoto } from "@/lib/vision";

export const runtime = "nodejs";

type EntityTarget = { contactId?: string; dealId?: string; meetingId?: string };

/** Confirms the signed-in user can actually see this entity before letting
 * them list/attach to its photos — the exact same ownership rule each
 * entity's own routes already enforce (see /api/deals/[id] for the deal
 * case): a "SALES" teammate only reaches their own contacts/deals. Meetings
 * have no per-teammate ownership anywhere in this app (see getMeeting), so
 * they're only checked at the org level here too, same as everywhere else
 * meetings are read. */
async function canAccessEntity(session: { orgId: string; role: string; userId: string }, target: EntityTarget): Promise<boolean> {
  const viewerOwnerId = session.role === "ADMIN" ? undefined : session.userId;
  if (target.contactId) return !!(await getContact(session.orgId, target.contactId, viewerOwnerId));
  if (target.dealId) return !!(await getDeal(session.orgId, target.dealId, viewerOwnerId));
  if (target.meetingId) return !!(await getMeeting(session.orgId, target.meetingId));
  return false;
}

function parseTarget(sp: URLSearchParams): EntityTarget {
  return {
    contactId: sp.get("contactId") || undefined,
    dealId: sp.get("dealId") || undefined,
    meetingId: sp.get("meetingId") || undefined,
  };
}

function isExactlyOne(target: EntityTarget): boolean {
  return [target.contactId, target.dealId, target.meetingId].filter(Boolean).length === 1;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const target = parseTarget(req.nextUrl.searchParams);
  if (!isExactlyOne(target)) {
    return NextResponse.json({ error: "Pass exactly one of contactId, dealId, meetingId." }, { status: 400 });
  }
  if (!(await canAccessEntity(session, target))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const attachments = await listAttachments(session.orgId, target);
  return NextResponse.json({ attachments });
}

const createSchema = z
  .object({
    contactId: z.string().optional(),
    dealId: z.string().optional(),
    meetingId: z.string().optional(),
    kind: z.enum(["photo", "note"]),
    fileName: z.string().optional(),
    mimeType: z.string().refine((m) => m.startsWith("image/"), { message: "Only image files are supported." }),
    dataBase64: z.string().min(1),
  })
  .refine((v) => isExactlyOne(v), { message: "Pass exactly one of contactId, dealId, meetingId." });

/** Creates a photo attachment and, for a `note` photo, transcribes it via
 * Claude's vision API right here before responding — a single photo is a
 * few seconds at most, so the caller just waits rather than this needing a
 * separate polling endpoint. The photo itself is always saved first and
 * kept even if transcription fails (no API key configured, or a transient
 * API error): losing the photo over a transcription hiccup would be the
 * worse failure of the two. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request." }, { status: 400 });
  }
  const { contactId, dealId, meetingId, kind, fileName, mimeType, dataBase64 } = parsed.data;

  // Rough raw-byte size from the base64 length (base64 runs ~4/3 the size of
  // the original bytes) — rejected before it ever reaches Postgres.
  const approxBytes = Math.floor((dataBase64.length * 3) / 4);
  if (approxBytes > ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: `Foto troppo grande (max ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB).` }, { status: 400 });
  }

  if (!(await canAccessEntity(session, { contactId, dealId, meetingId }))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let attachment = await createAttachment(session.orgId, {
    contactId,
    dealId,
    meetingId,
    kind,
    fileName,
    mimeType,
    dataBase64,
    uploadedBy: session.userId,
  });

  let transcriptionError: string | undefined;
  if (kind === "note") {
    const result = await transcribeNotePhoto({ base64: dataBase64, mimeType });
    if (result.ok) {
      await updateAttachmentTranscription(session.orgId, attachment.id, "done", result.text);
      attachment = { ...attachment, transcription: result.text, transcriptionStatus: "done" };
    } else {
      await updateAttachmentTranscription(session.orgId, attachment.id, "failed", null);
      attachment = { ...attachment, transcriptionStatus: "failed" };
      transcriptionError = transcribeErrorMessage(result.error);
    }
  }

  return NextResponse.json({ attachment, transcriptionError });
}
