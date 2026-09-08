import { LEAD_TEMPERATURES } from "@/lib/domain";

/**
 * Visual breakdown of contacts by lead temperature (hot/warm/cold/not scored) —
 * a donut built with a conic-gradient (no charting library needed) plus a
 * legend that always pairs each color with its emoji + label + count, so
 * identity never rides on color alone. Used on the Dashboard and Statistics
 * pages.
 */
export default function LeadTemperatureWidget({
  contacts,
  size = 128,
}: {
  contacts: { temperature: "hot" | "warm" | "cold" | null }[];
  size?: number;
}) {
  const counts: Record<string, number> = { hot: 0, warm: 0, cold: 0, none: 0 };
  for (const c of contacts) counts[c.temperature ?? "none"]++;
  const total = contacts.length || 1;

  const segments = [
    ...LEAD_TEMPERATURES.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, color: t.color, count: counts[t.id] })),
    { id: "none", label: "Not scored", emoji: "—", color: "var(--border)", count: counts.none },
  ].filter((s) => s.count > 0);

  let acc = 0;
  const stops = segments.map((s) => {
    const start = (acc / total) * 360;
    acc += s.count;
    const end = (acc / total) * 360;
    return `${s.color} ${start}deg ${end}deg`;
  });
  const gradient = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--panel-2)";
  const hotCount = counts.hot;

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background: gradient }}
        role="img"
        aria-label={`Lead temperature: ${segments.map((s) => `${s.count} ${s.label}`).join(", ")}`}
      >
        <div
          className="absolute rounded-full flex flex-col items-center justify-center"
          style={{
            inset: size * 0.18,
            background: "var(--panel)",
          }}
        >
          <div className="font-display text-lg leading-none" style={{ color: "var(--ink)" }}>
            {hotCount}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--ink-dim)" }}>
            hot leads
          </div>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        {segments.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span style={{ color: "var(--ink)" }}>
              {s.emoji} {s.label}
            </span>
            <span className="ml-auto font-mono pl-3" style={{ color: "var(--ink-dim)" }}>
              {s.count} · {Math.round((s.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
