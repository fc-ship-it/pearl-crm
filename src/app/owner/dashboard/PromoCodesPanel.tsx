"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PromoCode } from "@/lib/data";

const empty = { code: "", bonusDays: "", note: "", maxRedemptions: "" };

/** Owner-only CRUD for free-access promo codes — entered at /signup instead
 * of a card (see redeemPromoCode in data.ts). Built for things like giving a
 * test-team member a few months free without ever touching Stripe. */
export default function PromoCodesPanel({ codes }: { codes: PromoCode[] }) {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function create() {
    const bonusDays = Number(form.bonusDays);
    if (!form.code.trim() || !bonusDays || bonusDays <= 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/owner/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          bonusDays,
          note: form.note || undefined,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Qualcosa è andato storto.");
        return;
      }
      setForm(empty);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/owner/promo-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Codici inseribili in fase di iscrizione per saltare la carta — l&apos;account parte già attivo, gratis, per i
          giorni indicati (es. squadra di prova).
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium shrink-0"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          {open ? "Annulla" : "+ Nuovo codice"}
        </button>
      </div>

      {open && (
        <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Codice *
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="Es. PAOLA4MESI"
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Giorni gratuiti *
            <input
              type="number"
              min={1}
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              value={form.bonusDays}
              onChange={(e) => set("bonusDays", e.target.value)}
              placeholder="Es. 120 (≈ 4 mesi)"
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Nota interna (opzionale)
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Es. Squadra di prova — Paola Iommi"
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Numero massimo di usi (opzionale)
            <input
              type="number"
              min={1}
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              value={form.maxRedemptions}
              onChange={(e) => set("maxRedemptions", e.target.value)}
              placeholder="Vuoto = illimitato"
            />
          </label>
          {error && (
            <p className="text-xs md:col-span-2" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="md:col-span-2">
            <button
              onClick={create}
              disabled={busy || !form.code.trim() || !form.bonusDays}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              Salva codice
            </button>
          </div>
        </div>
      )}

      {codes.length === 0 ? (
        <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
          Nessun codice promozionale ancora.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ color: "var(--ink)" }}>
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ink-dim)", borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Giorni gratuiti</th>
                <th className="px-4 py-3 font-medium">Nota</th>
                <th className="px-4 py-3 font-medium">Usi</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium font-mono">{c.code}</td>
                  <td className="px-4 py-3">{c.bonusDays}</td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                    {c.note || "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                    {c.redemptionsCount}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                      style={
                        c.active
                          ? { background: "rgba(23,166,115,0.15)", color: "var(--success)" }
                          : { background: "var(--panel-2)", color: "var(--ink-dim)" }
                      }
                    >
                      {c.active ? "Attivo" : "Disattivato"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy}
                      onClick={() => toggle(c.id, !c.active)}
                      className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-50"
                      style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
                    >
                      {c.active ? "Disattiva" : "Riattiva"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
