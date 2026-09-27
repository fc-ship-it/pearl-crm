"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, X, ChevronUp, ChevronDown } from "lucide-react";

type WidgetOption = { id: string; label: string };
type Row = { id: string; label: string; enabled: boolean };

/**
 * Lets a user choose which Statistics-page cards show, and in what order —
 * "personalizzabili" per Federica's request. `selectedIds` (already
 * filtered/ordered by resolveStatisticsWidgets on the server) seeds which
 * rows start checked and in what order; any widget in `allWidgets` that
 * isn't in `selectedIds` is appended, unchecked, so it's still reachable
 * from here to turn back on. Saves via POST + router.refresh() so the page
 * re-renders server-side with the new set — same pattern as
 * <LanguageSwitcher>.
 */
export default function StatisticsWidgetCustomizer({
  allWidgets,
  selectedIds,
  labels,
}: {
  allWidgets: WidgetOption[];
  selectedIds: string[];
  labels: {
    customize: string;
    title: string;
    help: string;
    save: string;
    cancel: string;
    moveUp: string;
    moveDown: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => buildRows(allWidgets, selectedIds));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function openPanel() {
    setRows(buildRows(allWidgets, selectedIds));
    setOpen(true);
  }

  function toggle(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  function move(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const widgetIds = rows.filter((r) => r.enabled).map((r) => r.id);
    await fetch("/api/settings/statistics-widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetIds }),
    }).catch(() => {});
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
        style={{ background: "var(--panel-2)", color: "var(--ink)", border: "1px solid var(--border)" }}
      >
        <Settings2 size={13} /> {labels.customize}
      </button>

      {open && (
        <div
          className="fixed left-3 right-3 top-16 md:absolute md:left-auto md:right-0 md:top-11 md:w-[340px] max-h-[80vh] overflow-y-auto z-50 rounded-xl"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(21,27,46,0.18)" }}
        >
          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="font-display text-sm" style={{ color: "var(--ink)" }}>
              {labels.title}
            </h3>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: "var(--ink-dim)" }}>
              <X size={14} />
            </button>
          </div>
          <p className="text-xs px-4 mt-1 mb-3" style={{ color: "var(--ink-dim)" }}>
            {labels.help}
          </p>
          <div className="px-4 space-y-1">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-2 py-2 rounded-lg"
                style={{ background: "var(--panel-2)" }}
              >
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => toggle(r.id)}
                  className="shrink-0"
                  style={{ accentColor: "var(--gold)" }}
                />
                <span className="text-sm flex-1 truncate" style={{ color: r.enabled ? "var(--ink)" : "var(--ink-dim)" }}>
                  {r.label}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title={labels.moveUp}
                  aria-label={labels.moveUp}
                  className="shrink-0 disabled:opacity-30"
                  style={{ color: "var(--ink-dim)" }}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  title={labels.moveDown}
                  aria-label={labels.moveDown}
                  className="shrink-0 disabled:opacity-30"
                  style={{ color: "var(--ink-dim)" }}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 p-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-60"
              style={{ background: "var(--gold)", color: "var(--ink)" }}
            >
              {labels.save}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildRows(allWidgets: WidgetOption[], selectedIds: string[]): Row[] {
  const byId = new Map(allWidgets.map((w) => [w.id, w]));
  const selected = selectedIds.filter((id) => byId.has(id));
  const rest = allWidgets.map((w) => w.id).filter((id) => !selected.includes(id));
  return [...selected, ...rest].map((id) => ({ id, label: byId.get(id)!.label, enabled: selected.includes(id) }));
}
