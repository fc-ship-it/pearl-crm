import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listMeetings } from "@/lib/data";
import { relativeDaysLabel } from "@/lib/domain";
import { Plus } from "lucide-react";

export default async function MeetingsPage() {
  const session = await getSession();
  const meetings = listMeetings(session!.orgId);

  return (
    <div className="max-w-[900px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            AI Meetings & minutes
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
            Every meeting becomes structured minutes and automatic tasks.
          </p>
        </div>
        <Link
          href="/app/meetings/new"
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          <Plus size={16} /> New meeting
        </Link>
      </div>

      <div className="space-y-2">
        {meetings.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            No meetings yet. Create one to see the minutes generated automatically.
          </p>
        )}
        {meetings.map((m) => (
          <Link key={m.id} href={`/app/meetings/${m.id}`} className="card p-4 flex items-center justify-between block hover:opacity-90">
            <div>
              <div className="text-sm" style={{ color: "var(--ink)" }}>
                {m.title}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--ink-dim)" }}>
                {m.contactName} · {relativeDaysLabel(m.date)}
              </div>
            </div>
            <div className="text-xs" style={{ color: "var(--cyan)" }}>
              View minutes →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
