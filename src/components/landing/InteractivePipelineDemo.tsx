"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/domain";

type Card = { id: string; name: string; value: number; source: string };

const INITIAL: Record<string, Card[]> = {
  New: [
    { id: "1", name: "James Carter — Azure Bay Hotels", value: 68000, source: "Website" },
    { id: "2", name: "Ahmed Al Mansouri — Al Waha", value: 350000, source: "LinkedIn" },
  ],
  Negotiating: [{ id: "3", name: "Emily Novak — Meridian Precision", value: 155000, source: "Referral" }],
  Won: [{ id: "4", name: "Olivia Grant — Azure Bay Hotels", value: 30000, source: "Word of mouth" }],
};

const COLUMNS = ["New", "Negotiating", "Won"];

export default function InteractivePipelineDemo() {
  const [cols, setCols] = useState(INITIAL);

  function move(cardId: string, from: string, direction: 1 | -1) {
    const idx = COLUMNS.indexOf(from);
    const to = COLUMNS[idx + direction];
    if (!to) return;
    setCols((prev) => {
      const card = prev[from].find((c) => c.id === cardId)!;
      return {
        ...prev,
        [from]: prev[from].filter((c) => c.id !== cardId),
        [to]: [...prev[to], card],
      };
    });
  }

  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full"
          style={{ background: "rgba(0,212,255,0.15)", color: "var(--cyan)" }}
        >
          Interactive · try it
        </span>
        <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Move cards with the arrows
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const total = cols[col].reduce((s, c) => s + c.value, 0);
          return (
            <div key={col} className="rounded-xl p-2.5" style={{ background: "var(--panel-2)" }}>
              <div className="text-xs font-medium mb-0.5" style={{ color: "var(--ink)" }}>
                {col}
              </div>
              <div className="text-[10px] font-mono mb-2" style={{ color: "var(--gold)" }}>
                {formatCurrency(total)}
              </div>
              <div className="space-y-1.5 min-h-[70px]">
                {cols[col].map((card) => (
                  <div key={card.id} className="rounded-lg p-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="text-[11px] leading-tight" style={{ color: "var(--ink)" }}>
                      {card.name}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px]" style={{ color: "var(--ink-dim)" }}>
                        {card.source}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => move(card.id, col, -1)}
                          disabled={COLUMNS.indexOf(col) === 0}
                          className="p-0.5 rounded disabled:opacity-20"
                          style={{ background: "var(--panel-2)" }}
                        >
                          <ChevronLeft size={10} color="var(--ink-dim)" />
                        </button>
                        <button
                          onClick={() => move(card.id, col, 1)}
                          disabled={COLUMNS.indexOf(col) === COLUMNS.length - 1}
                          className="p-0.5 rounded disabled:opacity-20"
                          style={{ background: "var(--panel-2)" }}
                        >
                          <ChevronRight size={10} color="var(--ink-dim)" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
