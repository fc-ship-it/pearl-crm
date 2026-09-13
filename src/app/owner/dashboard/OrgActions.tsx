"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BILLING_PLANS } from "@/lib/domain";

export default function OrgActions({ orgId, currentPlan }: { orgId: string; currentPlan: string }) {
  const [busy, setBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/owner/organizations/${orgId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  // Separate from `call` above: the trial/plan actions always succeed
  // locally and just need a refresh, but this one hits a real external
  // email provider that can fail (e.g. Resend sandbox mode) — Federica
  // needs to see whether it actually went out, not just that the button
  // was clicked.
  async function resendWelcome() {
    setBusy(true);
    setResendMsg(null);
    try {
      const res = await fetch(`/api/owner/organizations/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_welcome" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendMsg({ kind: "success", text: `Email inviata a ${data.email}.` });
      } else {
        setResendMsg({ kind: "error", text: data.error || "Invio non riuscito." });
      }
    } catch {
      setResendMsg({ kind: "error", text: "Invio non riuscito — controlla la connessione." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => call({ action: "extend_trial", days: 14 })}
          className="px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          +14 giorni prova
        </button>
        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) call({ action: "grant_plan", plan: e.target.value });
            e.target.value = "";
          }}
          title="Grant a plan manually — for a customer who paid outside Ziina (bank transfer, cash, direct transfer)"
          className="px-2 py-1 rounded-lg text-xs disabled:opacity-50"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          <option value="">
            {currentPlan === "trial" ? "Grant plan (paid outside Ziina)…" : `Current: ${currentPlan} — grant/extend…`}
          </option>
          {BILLING_PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — AED {p.amountAed}
              {p.period}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={resendWelcome}
          title="Rimanda l'email di benvenuto a questo cliente — non tocca l'abbonamento"
          className="px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          ✉ Reinvia email benvenuto
        </button>
      </div>
      {resendMsg && (
        <span className="text-xs" style={{ color: resendMsg.kind === "success" ? "var(--success)" : "var(--danger)" }}>
          {resendMsg.text}
        </span>
      )}
    </div>
  );
}
