"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Check, ExternalLink } from "lucide-react";
import { formatCurrency, googleMapsSearchUrl, URGENCY_COLORS } from "@/lib/domain";
import type { WeeklyPlanDay, WeeklyPlanItem } from "@/lib/data";

type DateSlot = { iso: string; dayName: string; dateLabel: string };

export default function PlanWeekBoard({
  days,
  unscheduled,
  dates,
}: {
  days: WeeklyPlanDay[];
  unscheduled: WeeklyPlanItem[];
  dates: DateSlot[];
}) {
  const [scheduled, setScheduled] = useState<Record<string, "pending" | "done" | "error">>({});
  const router = useRouter();

  async function schedule(dealId: string, dateISO: string) {
    setScheduled((s) => ({ ...s, [dealId]: "pending" }));
    try {
      const res = await fetch("/api/plan-week/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, dateISO }),
      });
      if (!res.ok) throw new Error("failed");
      setScheduled((s) => ({ ...s, [dealId]: "done" }));
      router.refresh();
    } catch {
      setScheduled((s) => ({ ...s, [dealId]: "error" }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {days.map((day, i) => {
          const slot = dates[i];
          return (
            <div key={day.label} className="card p-4 flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  {slot?.dayName ?? day.label}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  {slot?.dateLabel}
                  {day.areas.length > 0 && ` · ${day.areas.join(" + ")}`}
                </div>
              </div>
              {day.items.length === 0 && (
                <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Nothing suggested for this day.
                </p>
              )}
              <div className="space-y-2">
                {day.items.map((it) => {
                  const state = scheduled[it.dealId];
                  return (
                    <div key={it.dealId} className="p-3 rounded-lg" style={{ background: "var(--panel-2)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm truncate" style={{ color: "var(--ink)" }}>
                            {it.contactName}
                          </div>
                          <div className="text-xs truncate" style={{ color: "var(--ink-dim)" }}>
                            {it.dealTitle}
                          </div>
                        </div>
                        <span
                          className="text-[9px] uppercase px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: `${URGENCY_COLORS[it.level]}22`, color: URGENCY_COLORS[it.level] }}
                        >
                          {it.level}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="text-xs font-mono" style={{ color: "var(--gold)" }}>
                          {formatCurrency(it.value)}
                        </span>
                        {it.address && (
                          <a
                            href={googleMapsSearchUrl(it.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] flex items-center gap-1 shrink-0"
                            style={{ color: "var(--cyan)" }}
                          >
                            <MapPin size={11} /> Maps <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={state === "pending" || state === "done"}
                        onClick={() => schedule(it.dealId, slot.iso)}
                        className="w-full mt-2 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                        style={
                          state === "done"
                            ? { background: "rgba(23,166,115,0.15)", color: "var(--success)" }
                            : { background: "var(--gold)", color: "var(--ink)" }
                        }
                      >
                        {state === "done" ? (
                          <span className="flex items-center justify-center gap-1">
                            <Check size={12} /> Scheduled
                          </span>
                        ) : state === "pending" ? (
                          "Scheduling…"
                        ) : (
                          `Schedule ${slot?.dayName ?? ""}`
                        )}
                      </button>
                      {state === "error" && (
                        <p className="text-[10px] mt-1" style={{ color: "var(--danger)" }}>
                          Couldn&apos;t schedule — try again.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <div className="card p-4">
          <h2 className="font-display text-sm mb-1" style={{ color: "var(--ink)" }}>
            Not placed on the map yet
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-dim)" }}>
            These need attention too, but there&apos;s no address on the contact to group or map them — add one and they&apos;ll join next week&apos;s plan.
          </p>
          <div className="space-y-2">
            {unscheduled.map((it) => (
              <div key={it.dealId} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--panel-2)" }}>
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: "var(--ink)" }}>
                    {it.contactName} <span style={{ color: "var(--ink-dim)" }}>— {it.dealTitle}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-[9px] uppercase px-1.5 py-0.5 rounded-full"
                    style={{ background: `${URGENCY_COLORS[it.level]}22`, color: URGENCY_COLORS[it.level] }}
                  >
                    {it.level}
                  </span>
                  {it.contactId && (
                    <a href={`/app/contacts/${it.contactId}`} className="text-xs" style={{ color: "var(--cyan)" }}>
                      Add address →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
