"use client";

import { useState } from "react";
import { Building2, X } from "lucide-react";

/** One-click product-validation banner ("would a Real Estate CRM module
 * interest you?"), shown once per user on the dashboard until they answer
 * or dismiss it. See /api/feature-interest + feature_interest_responses in
 * db.ts — pure signal-gathering, doesn't touch anything else. */
export default function InterestBanner() {
  const [visible, setVisible] = useState(true);
  const [answered, setAnswered] = useState(false);
  const [sending, setSending] = useState(false);

  async function answer(value: "yes" | "maybe" | "no") {
    setSending(true);
    try {
      await fetch("/api/feature-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: value }),
      });
      setAnswered(true);
    } finally {
      setSending(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="card p-4" style={{ border: "1px solid var(--border)", background: "var(--panel-2)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Building2 size={16} color="var(--gold)" className="mt-0.5 shrink-0" />
          <div>
            {answered ? (
              <p className="text-sm" style={{ color: "var(--ink)" }}>
                Grazie per il feedback — ci aiuta a decidere le prossime funzioni di Pearl.
              </p>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--ink)" }}>
                  Ti interesserebbe una versione di Pearl pensata per il real estate — con possibilità di caricare
                  PDF e video dei progetti e inviarli via mailing list?
                </p>
                <div className="flex gap-2 mt-2.5">
                  {(["yes", "maybe", "no"] as const).map((v) => (
                    <button
                      key={v}
                      disabled={sending}
                      onClick={() => answer(v)}
                      className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                      style={
                        v === "yes"
                          ? { background: "var(--gold)", color: "var(--ink)" }
                          : { border: "1px solid var(--border)", color: "var(--ink)" }
                      }
                    >
                      {v === "yes" ? "Sì, mi interessa" : v === "maybe" ? "Forse" : "No"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <button onClick={() => setVisible(false)} aria-label="Chiudi" style={{ color: "var(--ink-dim)" }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
