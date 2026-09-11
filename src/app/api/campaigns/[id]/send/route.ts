import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendCampaign, getCampaign, audienceForSegment } from "@/lib/data";
import { getValidGoogleAccessToken, sendGmail } from "@/lib/google";
import { getWhatsAppCreds, sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const before = await getCampaign(session.orgId, id);
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Snapshot the audience BEFORE sendCampaign flips the campaign to "sent" —
  // the segment fields don't change, but this keeps intent obvious.
  const audience = await audienceForSegment(session.orgId, {
    interest: before.segmentInterest || undefined,
    budgetTier: before.segmentBudgetTier || undefined,
    targetSegment: before.segmentTargetSegment || undefined,
  });

  const campaign = await sendCampaign(session.orgId, id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Real sending is best-effort and never blocks the response: the campaign
  // is recorded as sent regardless (matching the activity log we already
  // wrote), and delivery results are reported back for the UI to show.
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  if (campaign.channel === "email") {
    const accessToken = await getValidGoogleAccessToken(session.orgId).catch(() => null);
    for (const contact of audience) {
      if (!accessToken || !contact.email) {
        skipped++;
        continue;
      }
      try {
        await sendGmail(accessToken, { toEmail: contact.email, subject: campaign.title, bodyText: campaign.message });
        delivered++;
      } catch (e) {
        failed++;
        if (errors.length < 3) errors.push(e instanceof Error ? e.message : "unknown error");
      }
    }
  } else if (campaign.channel === "whatsapp") {
    const creds = await getWhatsAppCreds(session.orgId);
    for (const contact of audience) {
      if (!creds || !contact.phone) {
        skipped++;
        continue;
      }
      try {
        await sendWhatsAppMessage(creds, contact.phone, campaign.message);
        delivered++;
      } catch (e) {
        failed++;
        if (errors.length < 3) errors.push(e instanceof Error ? e.message : "unknown error");
      }
    }
  }

  return NextResponse.json({
    ok: true,
    campaign,
    delivery: { delivered, skipped, failed, errors, simulated: delivered === 0 && failed === 0 },
  });
}
