"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Sponsor } from "@/lib/data";

const empty = { name: "", headline: "", sector: "", offering: "", lookingFor: "", contactEmail: "", contactPhone: "" };

/** Owner-only CRUD for external "sponsor" listings in the Business Match
 * directory (monetization point #4) — commercial placements sold directly
 * by AHEAD LLC, not tied to any Pearl customer account. */
export default function SponsorsPanel({ sponsors }: { sponsors: Sponsor[] }) {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/owner/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
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
      await fetch(`/api/owner/sponsors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Rimuovere questo sponsor dalla directory?")) return;
    setBusy(true);
    try {
      await fetch(`/api/owner/sponsors/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Aziende esterne mostrate nella directory Business Match come sponsor, senza bisogno di un account Pearl.
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          {open ? "Annulla" : "+ Nuovo sponsor"}
        </button>
      </div>

      {open && (
        <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              ["name", "Nome azienda *"],
              ["sector", "Settore"],
              ["contactEmail", "Email di contatto"],
              ["contactPhone", "Telefono di contatto"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs" style={{ color: "var(--ink-dim)" }}>
              {label}
              <input
                className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
                style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </label>
          ))}
          <label className="text-xs md:col-span-2" style={{ color: "var(--ink-dim)" }}>
            Titolo/headline
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              value={form.headline}
              onChange={(e) => set("headline", e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Cosa offre
            <textarea
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)", minHeight: 60 }}
              value={form.offering}
              onChange={(e) => set("offering", e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Cosa cerca
            <textarea
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)", minHeight: 60 }}
              value={form.lookingFor}
              onChange={(e) => set("lookingFor", e.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <button
              onClick={create}
              disabled={busy || !form.name.trim()}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              Salva sponsor
            </button>
          </div>
        </div>
      )}

      {sponsors.length === 0 ? (
        <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
          Nessuno sponsor ancora.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ color: "var(--ink)" }}>
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ink-dim)", borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-3 font-medium">Azienda</th>
                <th className="px-4 py-3 font-medium">Settore</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                    {s.sector || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                      style={
                        s.active
                          ? { background: "rgba(23,166,115,0.15)", color: "var(--success)" }
                          : { background: "var(--panel-2)", color: "var(--ink-dim)" }
                      }
                    >
                      {s.active ? "Attivo" : "Sospeso"}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => toggle(s.id, !s.active)}
                      className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-50"
                      style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
                    >
                      {s.active ? "Sospendi" : "Riattiva"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => remove(s.id)}
                      className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-50"
                      style={{ background: "rgba(229,72,77,0.1)", border: "1px solid var(--danger)", color: "var(--danger)" }}
                    >
                      Elimina
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
