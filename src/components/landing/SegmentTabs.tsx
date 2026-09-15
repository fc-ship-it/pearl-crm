"use client";

// Audience-specific pitch, side by side with the generic feature grid below it.
// Both tabs describe real, shipped Pearl features (see FEATURES in page.tsx) —
// this just re-frames the same capabilities for the two buyer profiles that
// actually sign up: a sales team with a manager who wants visibility, and a
// solo professional (e.g. a real estate agent) who has no team at all.
import { useState } from "react";
import { Check } from "lucide-react";

const SEGMENTS = [
  {
    id: "team",
    label: "Sales teams",
    tag: "For a manager + reps",
    headline: "The manager sees the whole pipeline. Each rep sees their own.",
    points: [
      "Team-wide pipeline and forecast for the manager, a personal view for each rep",
      "Alerts ranked by deal value, so reps chase the right deals first — not just the newest ones",
      "AI meeting minutes turn every client call into tasks, automatically assigned",
    ],
  },
  {
    id: "solo",
    label: "Solo professionals",
    tag: "For agents & freelancers",
    headline: "Built for the person doing it all themselves.",
    points: [
      "Every WhatsApp, email and call logged in one place — nothing to dig for",
      "Wake up already knowing exactly who to call first today",
      "No IT setup: add your first contacts and you're working in minutes",
    ],
  },
] as const;

export default function SegmentTabs() {
  const [active, setActive] = useState<(typeof SEGMENTS)[number]["id"]>("team");
  const current = SEGMENTS.find((s) => s.id === active)!;

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {SEGMENTS.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={
                isActive
                  ? { background: "linear-gradient(135deg, var(--gold), var(--gold-soft))", color: "var(--ink)" }
                  : { background: "var(--panel-2)", color: "var(--ink-dim)", border: "1px solid var(--border)" }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="card p-6 md:p-8 max-w-[720px] mx-auto">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--magenta)" }}>
          {current.tag}
        </span>
        <h3 className="font-display text-xl mt-2 mb-5" style={{ color: "var(--ink)" }}>
          {current.headline}
        </h3>
        <ul className="space-y-3">
          {current.points.map((t) => (
            <li key={t} className="flex items-start gap-3 text-sm" style={{ color: "var(--ink-dim)" }}>
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0"
                style={{ background: "rgba(45,212,196,0.15)" }}
              >
                <Check size={12} color="var(--cyan)" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
