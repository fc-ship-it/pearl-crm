import { getSession } from "@/lib/auth";
import { dashboardStats, listDeals, listContacts, getUserPreferences, type Deal, type Contact } from "@/lib/data";
import {
  formatCurrency,
  stageConfig,
  OPEN_STAGES,
  contactSourceConfig,
  CONTACT_SOURCE_ORDER,
  CONTACT_SOURCE_COLORS,
  STATISTICS_WIDGETS,
  resolveStatisticsWidgets,
  type StatisticsWidgetId,
} from "@/lib/domain";
import { translator } from "@/lib/i18n";
import { resolveUserLocale } from "@/lib/i18n-server";
import LeadTemperatureWidget from "@/components/LeadTemperatureWidget";
import StatisticsWidgetCustomizer from "@/components/StatisticsWidgetCustomizer";
import { TrendingUp, Trophy, Users, Flame } from "lucide-react";

export default async function StatisticsPage() {
  const session = await getSession();
  const orgId = session!.orgId;
  // A "SALES" teammate sees only their own statistics; an ADMIN sees the
  // whole team's, same as before Settings -> Team existed.
  const viewerOwnerId = session!.role === "ADMIN" ? undefined : session!.userId;
  const stats = await dashboardStats(orgId, viewerOwnerId);
  const deals = await listDeals(orgId, viewerOwnerId);
  const contacts = await listContacts(orgId, {}, viewerOwnerId);
  const hotCount = contacts.filter((c) => c.temperature === "hot").length;
  const locale = await resolveUserLocale(session!.userId);
  const t = translator(locale);
  const prefs = await getUserPreferences(session!.userId);
  const widgetOrder = resolveStatisticsWidgets(prefs.statisticsWidgets);

  const statValues: Record<string, { icon: typeof TrendingUp; value: string; accent: string }> = {
    open_pipeline_value: { icon: TrendingUp, value: formatCurrency(stats.pipelineValue), accent: "var(--cyan)" },
    closed_won_value: { icon: Trophy, value: formatCurrency(stats.wonValue), accent: "var(--success)" },
    total_contacts: { icon: Users, value: String(contacts.length), accent: "var(--gold)" },
    hot_leads: { icon: Flame, value: String(hotCount), accent: "var(--danger)" },
  };

  const statCardIds = widgetOrder.filter((id) => STATISTICS_WIDGETS.find((w) => w.id === id)?.kind === "stat");
  const chartIds = widgetOrder.filter((id) => STATISTICS_WIDGETS.find((w) => w.id === id)?.kind === "chart");

  function widgetLabel(id: StatisticsWidgetId) {
    const w = STATISTICS_WIDGETS.find((w) => w.id === id);
    return w ? t(w.labelKey) : id;
  }

  function renderChart(id: StatisticsWidgetId) {
    switch (id) {
      case "pipeline_by_stage":
        return (
          <div key={id} className="card p-5">
            <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
              {widgetLabel(id)}
            </h2>
            <StageBarChart deals={deals} />
          </div>
        );
      case "lead_temperature":
        return (
          <div key={id} className="card p-5">
            <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
              {widgetLabel(id)}
            </h2>
            <LeadTemperatureWidget contacts={contacts} />
          </div>
        );
      case "contacts_by_source":
        return (
          <div key={id} className="card p-5">
            <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
              {widgetLabel(id)}
            </h2>
            <SourceBarChart contacts={contacts} noContactsLabel={t("statistics.noContactsYet")} />
          </div>
        );
      case "contacts_trend":
        return (
          <div key={id} className="card p-5">
            <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
              {widgetLabel(id)}
            </h2>
            <ContactsTrend contacts={contacts} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            {t("statistics.title")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
            {t("statistics.subtitle")}
          </p>
        </div>
        <StatisticsWidgetCustomizer
          allWidgets={STATISTICS_WIDGETS.map((w) => ({ id: w.id, label: t(w.labelKey) }))}
          selectedIds={widgetOrder}
          labels={{
            customize: t("common.customize"),
            title: t("statistics.customizeWidgets"),
            help: t("statistics.customizeHelp"),
            save: t("common.save"),
            cancel: t("common.cancel"),
            moveUp: t("statistics.moveUp"),
            moveDown: t("statistics.moveDown"),
          }}
        />
      </div>

      {statCardIds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statCardIds.map((id) => {
            const cfg = statValues[id];
            if (!cfg) return null;
            return <StatCard key={id} icon={cfg.icon} label={widgetLabel(id)} value={cfg.value} accent={cfg.accent} />;
          })}
        </div>
      )}

      {chartIds.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{chartIds.map((id) => renderChart(id))}</div>
      )}

      {widgetOrder.length === 0 && (
        <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
          {t("statistics.customizeHelp")}
        </p>
      )}
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
function SourceBarChart({ contacts, noContactsLabel }: { contacts: Contact[]; noContactsLabel: string }) {
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
          {noContactsLabel}
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
