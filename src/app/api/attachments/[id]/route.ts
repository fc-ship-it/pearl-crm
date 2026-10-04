import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  deleteAttachment,
  getAttachment,
  getContact,
  getDeal,
  getMeeting,
  setAttachmentCaption,
  updateAttachmentTranscription,
  type Attachment,
} from "@/lib/data";
import { transcribeErrorMessage, transcribeNotePhoto } from "@/lib/vision";

export const runtime = "nodejs";

/** Same ownership rule as /api/attachments — re-derived from the
 * attachment's own parent link rather than trusted from the request, since
 * the only thing the client sends here is the attachment id. */
async function canAccessAttachment(
  session: { orgId: string; role: string; userId: string },
  att: Pick<Attachment, "contactId" | "dealId" | "meetingId">
): Promise<boolean> {
  const viewerOwnerId = session.role === "ADMIN" ? undefined : session.userId;
  if (att.contactId) return !!(await getContact(session.orgId, att.contactId, viewerOwnerId));
  if (att.dealId) return !!(await getDeal(session.orgId, att.dealId, viewerOwnerId));
  if (att.meetingId) return !!(await getMeeting(session.orgId, att.meetingId));
  return false;
}

const patchSchema = z.object({
  transcription: z.string().max(10000).optional(),
  caption: z.string().max(2000).optional(),
  action: z.enum(["retranscribe"]).optional(),
});

/** Three independent things a photo's card can do after it's uploaded: the
 * user corrects the AI's transcription by hand, the user retries a failed
 * transcription, or (not currently exposed in the UI, kept for parity with
 * `photo`-kind captions) a caption edit. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const attachment = await getAttachment(session.orgId, id);
  if (!attachment || !(await canAccessAttachment(session, attachment))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.action === "retranscribe") {
    const result = await transcribeNotePhoto({ base64: attachment.dataBase64, mimeType: attachment.mimeType });
    if (result.ok) {
      await updateAttachmentTranscription(session.orgId, id, "done", result.text);
      return NextResponse.json({ ok: true, transcription: result.text, transcriptionStatus: "done" });
    }
    await updateAttachmentTranscription(session.orgId, id, "failed", attachment.transcription);
    return NextResponse.json({ error: transcribeErrorMessage(result.error), transcriptionStatus: "failed" }, { status: 502 });
  }

  if (typeof parsed.data.transcription === "string") {
    // The user correcting (or writing by hand) the transcription counts as
    // "done" — it's no longer pending or failed, whatever it was before.
    await updateAttachmentTranscription(session.orgId, id, "done", parsed.data.transcription);
  }
  if (typeof parsed.data.caption === "string") {
    await setAttachmentCaption(session.orgId, id, parsed.data.caption);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const attachment = await getAttachment(session.orgId, id);
  if (!attachment || !(await canAccessAttachment(session, attachment))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteAttachment(session.orgId, id);
  return NextResponse.json({ ok: true });
}
