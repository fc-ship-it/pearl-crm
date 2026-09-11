import { getSession } from "@/lib/auth";
import { dashboardStats, listTasks, listMeetings, listDeals, listContacts, hasAnsweredFeatureInterest, type Deal } from "@/lib/data";
import { formatCurrency, urgencyLevel, relativeDaysLabel, URGENCY_COLORS, stageConfig } from "@/lib/domain";
import Link from "next/link";
import TaskChecklist from "@/components/TaskChecklist";
import LeadTemperatureWidget from "@/components/LeadTemperatureWidget";
import InterestBanner from "@/components/InterestBanner";
import { TrendingUp, AlertTriangle, Trophy, Percent, BellRing } from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();
  const orgId = session!.orgId;
  const stats = await dashboardStats(orgId);
  const tasks = (await listTasks(orgId, { onlyOpen: true })).slice(0, 6);
  const meetings = (await listMeetings(orgId)).slice(0, 3);
  const contacts = await listContacts(orgId);
  const showInterestBanner = !(await hasAnsweredFeatureInterest(session!.userId));

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Good morning, {session!.name.split(" ")[0]}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
          Here's what deserves your attention today.
        </p>
      </div>

      {showInterestBanner && <InterestBanner />}

      {stats.dueCustomAlerts.length > 0 && (
        <div className="card p-4" style={{ border: "1px solid var(--warning)", background: "rgba(224,151,46,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <BellRing size={15} color="var(--warning)" />
            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              {stats.dueCustomAlerts.length} custom alert{stats.dueCustomAlerts.length === 1 ? "" : "s"} due
            </span>
          </div>
          <div className="space-y-1">
            {stats.dueCustomAlerts.map((a) => (
              <div key={a.id} className="text-sm" style={{ color: "var(--ink-dim)" }}>
                {a.title}
              </div>
            ))}
          </div>
          <Link href="/app/campaigns" className="text-xs mt-2 inline-block" style={{ color: "var(--cyan)" }}>
            Manage alerts →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Open pipeline value" value={formatCurrency(stats.pipelineValue)} accent="var(--cyan)" />
        <StatCard icon={Trophy} label="Closed won" value={formatCurrency(stats.wonValue)} accent="var(--success)" />
        <StatCard icon={Percent} label="Conversion rate" value={`${stats.conversionRate}%`} accent="var(--gold)" />
        <StatCard icon={AlertTriangle} label="Deals at risk" value={String(stats.dealsAtRisk.length)} accent="var(--danger)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm" style={{ color: "var(--ink)" }}>
              Reactivate today
            </h2>
            <Link href="/app/pipeline" className="text-xs" style={{ color: "var(--cyan)" }}>
              View pipeline →
            </Link>
          </div>
          <div className="space-y-2">
            {stats.dealsAtRisk.length === 0 && (
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                No quiet contacts right now. Great work.
              </p>
            )}
            {stats.dealsAtRisk.map(({ deal, score }) => {
              const level = urgencyLevel(score);
              return (
                <Link
                  key={deal.id}
                  href={`/app/contacts/${deal.contactId}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:opacity-90"
                  style={{ background: "var(--panel-2)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: "var(--ink)" }}>
                      {deal.title}
                    </div>
                    <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                      {deal.contactName} · quiet since {relativeDaysLabel(deal.lastInteractionAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono" style={{ color: "var(--ink-dim)" }}>
                      {formatCurrency(deal.value)}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full"
                      style={{ background: `${URGENCY_COLORS[level]}22`, color: URGENCY_COLORS[level] }}
                    >
                      {level}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Today's activity
          </h2>
          <TaskChecklist tasks={tasks} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Recent AI meeting minutes
          </h2>
          <div className="space-y-2">
            {meetings.length === 0 && (
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                No meetings logged yet.
              </p>
            )}
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/app/meetings/${m.id}`}
                className="block px-3 py-2.5 rounded-lg hover:opacity-90"
                style={{ background: "var(--panel-2)" }}
              >
                <div className="text-sm" style={{ color: "var(--ink)" }}>
                  {m.title}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  {m.contactName} · {relativeDaysLabel(m.date)}
                </div>
              </Link>
            ))}
          </div>
          <Link
            href="/app/meetings/new"
            className="mt-4 inline-block text-xs px-3 py-2 rounded-lg"
            style={{ background: "var(--gold)", color: "var(--ink)" }}
          >
            + New meeting
          </Link>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Pipeline by stage
          </h2>
          <PipelineMiniBars orgId={orgId} />
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm" style={{ color: "var(--ink)" }}>
              Lead temperature
            </h2>
            <Link href="/app/statistics" className="text-xs" style={{ color: "var(--cyan)" }}>
              Full stats →
            </Link>
          </div>
          <LeadTemperatureWidget contacts={contacts} size={104} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} color={accent} />
        <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
          {label}
        </span>
      </div>
      <div className="font-display text-lg" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

async function PipelineMiniBars({ orgId }: { orgId: string }) {
  const deals: Deal[] = await listDeals(orgId);
  const byStage = new Map<string, number>();
  deals.forEach((d) => byStage.set(d.stage, (byStage.get(d.stage) || 0) + d.value));
  const max = Math.max(1, ...Array.from(byStage.values()));
  const stagesOrder = ["lead", "contacted", "qualified", "proposal", "negotiation", "closed_won"];
  return (
    <div className="space-y-3">
      {stagesOrder.map((s) => {
        const cfg = stageConfig(s);
        const val = byStage.get(s) || 0;
        return (
          <div key={s}>
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--ink-dim)" }}>
              <span>{cfg.label}</span>
              <span className="font-mono">{formatCurrency(val)}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: "var(--panel-2)" }}>
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.max(4, (val / max) * 100)}%`, background: cfg.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
