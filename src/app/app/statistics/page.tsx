import { getSession } from "@/lib/auth";
import { dashboardStats, listDeals, listContacts, type Deal, type Contact } from "@/lib/data";
import {
  formatCurrency,
  stageConfig,
  STAGES,
  OPEN_STAGES,
  contactSourceConfig,
  CONTACT_SOURCE_ORDER,
  CONTACT_SOURCE_COLORS,
} from "@/lib/domain";
import LeadTemperatureWidget from "@/components/LeadTemperatureWidget";
import { TrendingUp, Trophy, Users, Flame } from "lucide-react";

export default async function StatisticsPage() {
  const session = await getSession();
  const orgId = session!.orgId;
  const stats = await dashboardStats(orgId);
  const deals = await listDeals(orgId);
  const contacts = await listContacts(orgId);
  const hotCount = contacts.filter((c) => c.temperature === "hot").length;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Statistics
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
          Pipeline, contacts, and lead-quality trends at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Open pipeline value" value={formatCurrency(stats.pipelineValue)} accent="var(--cyan)" />
        <StatCard icon={Trophy} label="Closed won value" value={formatCurrency(stats.wonValue)} accent="var(--success)" />
        <StatCard icon={Users} label="Total contacts" value={String(contacts.length)} accent="var(--gold)" />
        <StatCard icon={Flame} label="Hot leads" value={String(hotCount)} accent="var(--danger)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Pipeline value by stage
          </h2>
          <StageBarChart deals={deals} />
        </div>

        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Lead temperature
          </h2>
          <LeadTemperatureWidget contacts={contacts} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Contacts by source
          </h2>
          <SourceBarChart contacts={contacts} />
        </div>

        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            New contacts, last 8 weeks
          </h2>
          <ContactsTrend contacts={contacts} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
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

/** Magnitude by category, one axis, fixed pipeline-stage order and each
 * stage's own established color (reused from the pipeline board elsewhere in
 * the app, not re-derived) — value is always shown as a direct label, never
 * color alone. Single series, so no legend box is needed (the chart title
 * already names it). */
function StageBarChart({ deals }: { deals: Deal[] }) {
  const byStage = new Map<string, number>();
  deals.forEach((d) => byStage.set(d.stage, (byStage.get(d.stage) || 0) + d.value));
  const stagesOrder = [...OPEN_STAGES, "closed_won"];
  const max = Math.max(1, ...stagesOrder.map((s) => byStage.get(s) || 0));

  return (
    <div className="space-y-3">
      {stagesOrder.map((s) => {
        const cfg = stageConfig(s);
        const val = byStage.get(s) || 0;
        return (
          <div key={s}>
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--ink-dim)" }}>
              <span>{cfg.label}</span>
              <span className="font-mono" style={{ color: "var(--ink)" }}>
                {formatCurrency(val)}
              </span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: "var(--panel-2)" }}>
              <div
                className="h-2.5 rounded-full"
                style={{ width: `${Math.max(val > 0 ? 3 : 0, (val / max) * 100)}%`, background: cfg.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Categorical breakdown, fixed source order (never re-sorted by count so a
 * color always means the same source), validated 4-color palette — legend
 * pairs every swatch with its label since >= 2 series are shown. */
function SourceBarChart({ contacts }: { contacts: Contact[] }) {
  const counts = new Map<string, number>();
  contacts.forEach((c) => counts.set(c.source || "manual", (counts.get(c.source || "manual") || 0) + 1));
  const max = Math.max(1, ...CONTACT_SOURCE_ORDER.map((s) => counts.get(s) || 0));

  return (
    <div className="space-y-3">
      {CONTACT_SOURCE_ORDER.map((s) => {
        const count = counts.get(s) || 0;
        const cfg = contactSourceConfig(s);
        const color = CONTACT_SOURCE_COLORS[s];
        return (
          <div key={s}>
            <div className="flex justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                {cfg.label}
              </span>
              <span className="font-mono" style={{ color: "var(--ink-dim)" }}>
                {count}
              </span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: "var(--panel-2)" }}>
              <div
                className="h-2.5 rounded-full"
                style={{ width: `${Math.max(count > 0 ? 3 : 0, (count / max) * 100)}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
      {contacts.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          No contacts yet.
        </p>
      )}
    </div>
  );
}

/** Simple weekly trend — a single sequential-hue series (gold, light→dark by
 * recency isn't meaningful here so a flat brand hue is used), one axis,
 * direct value labels on hover via title attr, no legend needed for one
 * series. */
function ContactsTrend({ contacts }: { contacts: Contact[] }) {
  const weeks = 8;
  const now = new Date();
  const buckets: { label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const count = contacts.filter((c) => {
      const t = new Date(c.createdAt).getTime();
      return t > start.getTime() && t <= end.getTime();
    }).length;
    buckets.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, count });
  }
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${b.label}: ${b.count} new contact${b.count === 1 ? "" : "s"}`}>
            <span className="text-[10px] mb-1 font-mono" style={{ color: "var(--ink-dim)" }}>
              {b.count > 0 ? b.count : ""}
            </span>
            <div
              className="w-full rounded-t-md"
              style={{ height: `${Math.max(b.count > 0 ? 6 : 2, (b.count / max) * 100)}%`, background: "var(--gold)" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 text-center text-[9px]" style={{ color: "var(--ink-dim)" }}>
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}
