"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/domain";

export default function RoiCalculator() {
  const [hours, setHours] = useState(5);
  const [people, setPeople] = useState(4);
  const [cost, setCost] = useState(100);

  const weeklyHours = hours * people;
  const yearlyHours = Math.round(weeklyHours * 48);
  const yearlyDays = Math.round(yearlyHours / 8);
  const yearlyCost = Math.round(yearlyHours * cost);

  return (
    <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <Slider label="Hours per week, per person" value={hours} min={1} max={20} onChange={setHours} suffix="h" />
      <Slider label="How many people manually track contacts" value={people} min={1} max={30} onChange={setPeople} />
      <Slider label="Cost of one hour of work" value={cost} min={50} max={300} onChange={setCost} suffix=" AED" />

      <div className="mt-5 rounded-xl p-5 text-center" style={{ background: "linear-gradient(180deg, #150a2e, #05070B)" }}>
        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--ink-dim)" }}>
          In one year
        </div>
        <div className="font-display text-4xl" style={{ background: "linear-gradient(90deg, var(--cyan), var(--magenta))", WebkitBackgroundClip: "text", color: "transparent" }}>
          {formatNumber(yearlyHours)}
        </div>
        <div className="text-sm mb-3" style={{ color: "var(--ink-dim)" }}>
          hours spent chasing contacts instead of closing them
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            <div className="font-display text-lg" style={{ color: "var(--ink)" }}>
              {yearlyDays}
            </div>
            <div className="text-[10px]" style={{ color: "var(--ink-dim)" }}>
              8-hour work days
            </div>
          </div>
          <div>
            <div className="font-display text-lg" style={{ color: "var(--ink)" }}>
              AED {formatNumber(yearlyCost)}
            </div>
            <div className="text-[10px]" style={{ color: "var(--ink-dim)" }}>
              staff cost
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] mt-3" style={{ color: "var(--ink-dim)" }}>
        Estimate based on 48 working weeks: meant to give a sense of scale, not a quote.
      </p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        <span className="text-sm font-mono font-bold" style={{ color: "var(--gold)" }}>
          {value}
          {suffix || ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--gold)]"
      />
      <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--ink-dim)" }}>
        <span>
          {min}
          {suffix || ""}
        </span>
        <span>
          {max}
          {suffix || ""}
        </span>
      </div>
    </div>
  );
}
