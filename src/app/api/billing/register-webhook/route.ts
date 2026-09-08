import { NextRequest, NextResponse } from "next/server";
import { registerWebhook, ZiinaNotConfiguredError } from "@/lib/ziina";
import { getAppBaseUrl } from "@/lib/google";

export const runtime = "nodejs";

/** One-off (but safe to re-run) setup call — registers this deployment's
 * /api/billing/webhook URL with Ziina, so a completed payment updates the
 * org's subscription even if the customer closes the tab before the
 * success-page redirect fires. Protected the same way as the cron sweep, by
 * reusing CRON_SECRET (it's an admin-only action, not worth a third secret).
 * Visit https://<your-app>/api/billing/register-webhook?token=<CRON_SECRET>
 * once after ZIINA_ACCESS_TOKEN is set — see ZIINA_INTEGRATION.md. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const webhookUrl = `${getAppBaseUrl(req.url)}/api/billing/webhook`;
  try {
    const result = await registerWebhook(webhookUrl);
    return NextResponse.json({ ok: result.success !== false, webhookUrl, result });
  } catch (err) {
    if (err instanceof ZiinaNotConfiguredError) {
      return NextResponse.json({ error: "ZIINA_ACCESS_TOKEN is not set." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 502 });
  }
}
