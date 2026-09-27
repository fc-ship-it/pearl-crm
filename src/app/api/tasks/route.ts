import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTask } from "@/lib/data";

export const runtime = "nodejs";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

/** Standalone task creation — used by the quick-add "+" menu. Tasks
 * auto-generated from an AI meeting's next steps go through a different
 * path (POST /api/meetings), but land in the same table and list. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (body.priority && !VALID_PRIORITIES.has(body.priority)) {
    return NextResponse.json({ error: "invalid priority" }, { status: 400 });
  }

  const task = await createTask(session.orgId, {
    title: body.title,
    dueDate: body.dueDate || null,
    priority: body.priority || "medium",
    contactId: body.contactId || null,
    dealId: body.dealId || null,
    ownerId: session.userId,
  });

  return NextResponse.json({ ok: true, task });
}
