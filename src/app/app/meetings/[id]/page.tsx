import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMeeting } from "@/lib/data";
import { formatDate } from "@/lib/domain";
import { CheckCircle2, MessageSquareWarning, ListChecks, ArrowRight, Users } from "lucide-react";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const meeting = await getMeeting(session!.orgId, id);
  if (!meeting || !meeting.summary) notFound();
  const s = meeting.summary;

  return (
    <div className="max-w-[800px] space-y-5">
      <div>
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          {meeting.title}
        </h1>
        <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "var(--ink-dim)" }}>
          <Users size={14} /> {s.participants.join(", ")} · {formatDate(meeting.date)}
        </p>
      </div>

      <Section icon={ListChecks} title="Key points discussed" items={s.keyPoints} accent="var(--cyan)" />
      <Section icon={CheckCircle2} title="Decisions made" items={s.decisions} accent="var(--success)" />
      <Section icon={MessageSquareWarning} title="Client objections" items={s.objections} accent="var(--warning)" />

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ArrowRight size={15} color="var(--gold)" />
          <h2 className="font-display text-sm" style={{ color: "var(--ink)" }}>
            Next steps (added as tasks)
          </h2>
        </div>
        <div className="space-y-2">
          {s.nextSteps.map((p, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--panel-2)" }}>
              <span className="text-sm" style={{ color: "var(--ink)" }}>
                {p.action}
              </span>
              <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
                {p.owner} · due {formatDate(p.dueDate)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, items, accent }: { icon: any; title: string; items: string[]; accent: string }) {
  if (items.length === 0) return null;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} color={accent} />
        <h2 className="font-display text-sm" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-sm pl-3" style={{ color: "var(--ink-dim)", borderLeft: `2px solid ${accent}` }}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
