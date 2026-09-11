"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Search, Mail, Phone, ShieldCheck, CheckCircle2, AlertTriangle, Star, Megaphone } from "lucide-react";
import type { MatchProfile } from "@/lib/data";

const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

type OwnProfile = {
  optIn: boolean;
  headline: string;
  sector: string;
  offering: string;
  lookingFor: string;
  contactEmail: string;
  contactPhone: string;
  featuredActive: boolean;
};

export default function BusinessMatchClient({
  initialOwn,
  initialDirectory,
  initialSearch,
  justFeatured,
  featuredCanceled,
  featuredPriceAed,
}: {
  initialOwn: OwnProfile;
  initialDirectory: MatchProfile[];
  initialSearch: string;
  justFeatured?: boolean;
  featuredCanceled?: boolean;
  featuredPriceAed: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<OwnProfile>(initialOwn);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(
    justFeatured
      ? { kind: "success", text: "Profilo messo in evidenza — ora compare in cima alla directory." }
      : featuredCanceled
      ? { kind: "error", text: "Pagamento annullato — il profilo non è stato messo in evidenza." }
      : null
  );
  const [search, setSearch] = useState(initialSearch);
  const [featuring, setFeaturing] = useState(false);

  function set<K extends keyof OwnProfile>(key: K, value: OwnProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(nextOptIn: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/matching/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, optIn: nextOptIn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error || "Salvataggio non riuscito." });
        return;
      }
      setForm((f) => ({ ...f, optIn: nextOptIn }));
      setMessage({
        kind: "success",
        text: nextOptIn ? "Profilo pubblicato — ora visibile alle altre aziende su Pearl." : "Visibilità disattivata.",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function startFeatured() {
    setFeaturing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/matching/featured/checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirect_url) {
        setMessage({ kind: "error", text: data.error || "Qualcosa è andato storto. Riprova." });
        setFeaturing(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setMessage({ kind: "error", text: "Non riesco a raggiungere il gestore dei pagamenti. Riprova." });
      setFeaturing(false);
    }
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    router.push(`/app/network${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center gap-2 mb-1">
        <Handshake size={20} color="var(--gold)" />
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Business Match
        </h1>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Una directory opt-in tra le aziende clienti di Pearl: pubblica un profilo con cosa offri e cosa cerchi, e
        scopri le altre aziende che hanno fatto lo stesso.
      </p>

      <div
        className="card p-3 mb-6 flex items-start gap-2"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
      >
        <ShieldCheck size={15} color="var(--gold)" className="mt-0.5 shrink-0" />
        <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Questa vetrina è del tutto separata dai tuoi contatti e dalla tua pipeline: non condivide mai i dati dei
          tuoi clienti o lead con le altre aziende. Compare qui solo ciò che scrivi in questo modulo, e solo se
          attivi la visibilità. Puoi disattivarla in qualsiasi momento — i dati restano salvati ma spariscono dalla
          directory.
        </p>
      </div>

      {message && (
        <div
          className="card p-3 mb-4 flex items-start gap-2"
          style={
            message.kind === "success"
              ? { background: "rgba(23,166,115,0.08)", border: "1px solid var(--success)" }
              : { background: "rgba(229,72,77,0.08)", border: "1px solid var(--danger)" }
          }
        >
          {message.kind === "success" ? (
            <CheckCircle2 size={15} color="var(--success)" className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={15} color="var(--danger)" className="mt-0.5 shrink-0" />
          )}
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {message.text}
          </p>
        </div>
      )}

      <div className="card p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base" style={{ color: "var(--ink)" }}>
            Il tuo profilo
          </h2>
          <span
            className="text-[10px] uppercase px-2 py-0.5 rounded-full"
            style={
              form.optIn
                ? { background: "rgba(23,166,115,0.15)", color: "var(--success)" }
                : { background: "var(--panel-2)", color: "var(--ink-dim)" }
            }
          >
            {form.optIn ? "Visibile" : "Nascosto"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs md:col-span-2" style={{ color: "var(--ink-dim)" }}>
            Titolo *
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={inputStyle}
              placeholder='Es. "Agenzia di marketing digitale per hotel a Dubai"'
              value={form.headline}
              onChange={(e) => set("headline", e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Settore
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={inputStyle}
              placeholder="Es. Real estate, hospitality, F&B..."
              value={form.sector}
              onChange={(e) => set("sector", e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Email di contatto
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={inputStyle}
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </label>
          <label className="text-xs md:col-span-2" style={{ color: "var(--ink-dim)" }}>
            Cosa offri *
            <textarea
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ ...inputStyle, minHeight: 70 }}
              value={form.offering}
              onChange={(e) => set("offering", e.target.value)}
            />
          </label>
          <label className="text-xs md:col-span-2" style={{ color: "var(--ink-dim)" }}>
            Cosa cerchi *
            <textarea
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={{ ...inputStyle, minHeight: 70 }}
              value={form.lookingFor}
              onChange={(e) => set("lookingFor", e.target.value)}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Telefono di contatto
            <input
              className="w-full rounded-lg px-3 py-2 mt-1 text-sm"
              style={inputStyle}
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </label>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--gold)", color: "var(--ink)" }}
            disabled={saving}
            onClick={() => save(true)}
          >
            {form.optIn ? "Salva profilo" : "Attiva visibilità e salva"}
          </button>
          {form.optIn && (
            <button
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
              disabled={saving}
              onClick={() => save(false)}
            >
              Disattiva visibilità
            </button>
          )}
        </div>

        {form.optIn && (
          <div className="flex items-center justify-between gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <Star size={14} color={form.featuredActive ? "var(--gold)" : "var(--ink-dim)"} />
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                {form.featuredActive
                  ? "Il tuo profilo è in evidenza — compare in cima alla directory."
                  : `Metti il profilo in evidenza in cima alla directory — AED ${featuredPriceAed}/mese, disdicibile quando vuoi.`}
              </p>
            </div>
            {!form.featuredActive && (
              <button
                onClick={startFeatured}
                disabled={featuring}
                className="text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap disabled:opacity-60"
                style={{ background: "var(--gold)", color: "var(--ink)" }}
              >
                {featuring ? "Un attimo…" : "Metti in evidenza"}
              </button>
            )}
          </div>
        )}
      </div>

      <h2 className="font-display text-base mb-3" style={{ color: "var(--ink)" }}>
        Directory delle aziende
      </h2>
      <form onSubmit={submitSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-[380px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" color="var(--ink-dim)" />
          <input
            className="w-full rounded-lg pl-8 pr-3 py-2 text-sm"
            style={inputStyle}
            placeholder="Cerca per settore, offerta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          Cerca
        </button>
      </form>

      {initialDirectory.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            {initialSearch
              ? "Nessuna azienda trovata per questa ricerca."
              : "Ancora nessuna azienda visibile nella directory. Attiva il tuo profilo qui sopra per essere tra le prime."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initialDirectory.map((p) => (
            <div
              key={`${p.kind}-${p.orgId}`}
              className="card p-4"
              style={p.featured ? { border: "1px solid var(--gold)" } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  {p.orgName}
                </div>
                {p.kind === "sponsor" ? (
                  <span
                    className="flex items-center gap-1 text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(212,168,67,0.15)", color: "var(--gold)" }}
                  >
                    <Megaphone size={10} /> Sponsor
                  </span>
                ) : p.featured ? (
                  <span
                    className="flex items-center gap-1 text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(212,168,67,0.15)", color: "var(--gold)" }}
                  >
                    <Star size={10} /> In evidenza
                  </span>
                ) : null}
              </div>
              {p.sector && (
                <div className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: "var(--gold)" }}>
                  {p.sector}
                </div>
              )}
              {p.headline && (
                <p className="text-sm mt-2" style={{ color: "var(--ink)" }}>
                  {p.headline}
                </p>
              )}
              {p.offering && (
                <p className="text-xs mt-2" style={{ color: "var(--ink-dim)" }}>
                  <span style={{ color: "var(--ink)" }}>Offre:</span> {p.offering}
                </p>
              )}
              {p.lookingFor && (
                <p className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                  <span style={{ color: "var(--ink)" }}>Cerca:</span> {p.lookingFor}
                </p>
              )}
              {(p.contactEmail || p.contactPhone) && (
                <div className="flex flex-wrap gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  {p.contactEmail && (
                    <a
                      href={`mailto:${p.contactEmail}`}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--gold)" }}
                    >
                      <Mail size={12} /> {p.contactEmail}
                    </a>
                  )}
                  {p.contactPhone && (
                    <a
                      href={`tel:${p.contactPhone}`}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--gold)" }}
                    >
                      <Phone size={12} /> {p.contactPhone}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
