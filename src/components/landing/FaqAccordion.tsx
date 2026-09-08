"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

const FAQS = [
  {
    q: "Am I charged anything during the trial?",
    a: "No. You start the free trial without entering any payment details in this demo version. In production, even if requested, nothing is charged before the trial days are up.",
  },
  {
    q: "How does the free trial work?",
    a: "You get 7 days to use the platform with real data. If it's not for you, you simply don't activate a paid plan.",
  },
  {
    q: "Are there any hidden costs?",
    a: "No: the price of the plan you choose includes all of that plan's features. No extra tools to buy separately.",
  },
  {
    q: "Do I need to be tech-savvy to use it?",
    a: "No. The pipeline updates with a drag or two taps, alerts and meeting minutes generate themselves: you see the value from minute one with no configuration.",
  },
  {
    q: "Does it integrate with my tools?",
    a: "Gmail and Google Calendar connect natively. Connecting WhatsApp Business requires official Meta approval (a technical timeline outside our control) and is activated at go-live.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="max-w-[720px] mx-auto divide-y" style={{ borderColor: "var(--border)" }}>
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="py-4" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center justify-between text-left gap-4">
              <span className="text-sm md:text-base" style={{ color: "var(--ink)" }}>
                {f.q}
              </span>
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,46,166,0.12)", color: "var(--magenta)" }}
              >
                {isOpen ? <X size={13} /> : <Plus size={13} />}
              </span>
            </button>
            {isOpen && (
              <p className="text-sm mt-3" style={{ color: "var(--ink-dim)" }}>
                {f.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
