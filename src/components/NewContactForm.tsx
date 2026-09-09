"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, QrCode, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { BUDGET_TIERS, TARGET_SEGMENT_SUGGESTIONS } from "@/lib/domain";
import { parseVCardFile, classifyQrPayload, type ParsedContact } from "@/lib/vcard";
import QrScanner from "@/components/QrScanner";

type Tab = "manual" | "qr" | "import";

const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

type Draft = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  interest: string;
  budgetTier: string;
  targetSegment: string;
  source: string;
};

const emptyDraft: Draft = { name: "", email: "", phone: "", companyName: "", interest: "", budgetTier: "", targetSegment: "", source: "manual" };

export default function NewContactForm({ companyNames }: { companyNames: string[] }) {
  const [tab, setTab] = useState<Tab>("manual");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function applyScan(text: string) {
    const payload = classifyQrPayload(text);
    setScannerOpen(false);
    // Scanning switches to the manual tab pre-filled and expects a manual
    // "Confirm & save" tap to finish — without this scroll, that banner and
    // button can land off-screen (especially on mobile) and look like the
    // scan silently did nothing.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    if (payload.kind === "vcard") {
      const c = payload.contact;
      setDraft((d) => ({ ...d, name: c.name, email: c.email || d.email, phone: c.phone || d.phone, companyName: c.org || d.companyName, source: "qr" }));
      setScanNote("Scanned a business-card QR code — review the details below and save.");
    } else if (payload.kind === "whatsapp") {
      setDraft((d) => ({ ...d, phone: `+${payload.phone}`, source: "whatsapp-qr" }));
      setScanNote("Scanned a WhatsApp \"click to chat\" QR code — the phone number was filled in. Add a name to save.");
    } else if (payload.kind === "whatsapp-opaque") {
      setDraft((d) => ({ ...d, source: "whatsapp-qr" }));
      setScanNote("This is a personal WhatsApp QR code — it only resolves inside the WhatsApp app, so it doesn't carry the phone number directly. Enter the number manually below.");
    } else if (payload.kind === "phone") {
      setDraft((d) => ({ ...d, phone: payload.phone, source: "qr" }));
      setScanNote("Scanned a phone number — add a name to save.");
    } else if (payload.kind === "url") {
      setScanNote(`Scanned a link (${payload.url}) that isn't a contact card. Enter the contact's details manually.`);
    } else {
      setScanNote(`Scanned: "${payload.text}" — this doesn't look like a contact card. Enter the details manually.`);
    }
    setTab("manual");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong while saving the contact.");
      return;
    }
    const data = await res.json();
    router.push(`/app/contacts/${data.contact.id}`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 p-1 rounded-xl overflow-x-auto max-w-full" style={{ background: "var(--panel-2)", width: "fit-content" }}>
        <TabButton active={tab === "manual"} onClick={() => setTab("manual")} icon={<UserPlus size={14} />} label="Manual entry" />
        <TabButton active={tab === "qr"} onClick={() => setTab("qr")} icon={<QrCode size={14} />} label="Scan QR code" />
        <TabButton active={tab === "import"} onClick={() => setTab("import")} icon={<Upload size={14} />} label="Import from phone" />
      </div>

      {scanNote && (
        <div className="card p-3 mb-4 flex items-start gap-2" style={{ background: "rgba(15,181,166,0.08)", border: "1px solid var(--cyan)" }}>
          <CheckCircle2 size={15} color="var(--cyan)" className="mt-0.5 shrink-0" />
          <p className="text-xs" style={{ color: "var(--ink)" }}>
            {scanNote}
          </p>
        </div>
      )}

      {tab === "manual" && (
        <form onSubmit={submitManual} className="card p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Full name *
              </label>
              <input required value={draft.name} onChange={(e) => set("name", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Company
              </label>
              <input list="company-suggestions" value={draft.companyName} onChange={(e) => set("companyName", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              <datalist id="company-suggestions">
                {companyNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Email
              </label>
              <input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Phone
              </label>
              <input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+971 5x xxx xxxx" className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-xs mb-3" style={{ color: "var(--ink-dim)" }}>
              Lead qualification
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Interest
                </label>
                <input value={draft.interest} onChange={(e) => set("interest", e.target.value)} placeholder="E.g. Fleet software" className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Budget
                </label>
                <select value={draft.budgetTier} onChange={(e) => set("budgetTier", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Unknown</option>
                  {BUDGET_TIERS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.range})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Target segment
                </label>
                <input list="segment-suggestions" value={draft.targetSegment} onChange={(e) => set("targetSegment", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                <datalist id="segment-suggestions">
                  {TARGET_SEGMENT_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--gold)", color: "var(--ink)" }}
          >
            {saving ? "Saving…" : scanNote ? "Confirm & save this contact" : "Save contact"}
          </button>
        </form>
      )}

      {tab === "qr" && (
        <div className="card p-6 text-center">
          <QrCode size={32} color="var(--gold)" className="mx-auto mb-3" />
          <p className="text-sm mb-1" style={{ color: "var(--ink)" }}>
            Scan a business card or WhatsApp QR code
          </p>
          <p className="text-xs mb-5" style={{ color: "var(--ink-dim)" }}>
            Uses your camera to read the QR code and fill in the contact form. You can also upload a photo of the code instead.
          </p>
          <button onClick={() => setScannerOpen(true)} className="px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            Open scanner
          </button>
        </div>
      )}

      {tab === "import" && <ImportTab companyNames={companyNames} />}

      {scannerOpen && <QrScanner onResult={applyScan} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
      style={active ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(36,19,64,0.08)" } : { color: "var(--ink-dim)" }}
      type="button"
    >
      {icon} {label}
    </button>
  );
}

function ImportTab({ companyNames }: { companyNames: string[] }) {
  const [parsed, setParsed] = useState<ParsedContact[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [batchTargetSegment, setBatchTargetSegment] = useState("");
  const [batchBudgetTier, setBatchBudgetTier] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [parseError, setParseError] = useState("");
  const [importError, setImportError] = useState("");

  function handleFile(file: File) {
    setResult(null);
    setParseError("");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const contacts = parseVCardFile(text);
      if (contacts.length === 0) {
        setParseError("No contacts found in that file. Make sure it's a vCard (.vcf) export.");
        return;
      }
      setParsed(contacts);
      const initialSelected: Record<number, boolean> = {};
      contacts.forEach((_, i) => (initialSelected[i] = true));
      setSelected(initialSelected);
    };
    reader.readAsText(file);
  }

  async function doImport() {
    const toImport = parsed.filter((_, i) => selected[i]);
    if (toImport.length === 0) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: toImport.map((c) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            companyName: c.org,
            targetSegment: batchTargetSegment || null,
            budgetTier: batchBudgetTier || null,
            source: "import",
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setImporting(false);
      if (!res.ok) {
        // Previously this branch didn't exist at all — a failed request
        // (session expired, server error) just silently did nothing, which
        // looks exactly like "import doesn't work" with zero explanation.
        setImportError(data.error || "Something went wrong while importing. Please try again.");
        return;
      }
      setResult({ imported: data.imported, skipped: data.skipped });
      setParsed([]);
    } catch {
      setImporting(false);
      setImportError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="card p-6">
      {parsed.length === 0 && !result && (
        <>
          <Upload size={28} color="var(--gold)" className="mb-3" />
          <p className="text-sm mb-1" style={{ color: "var(--ink)" }}>
            Import contacts from Android or iPhone
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--ink-dim)" }}>
            Export your phone's contacts as a vCard (.vcf) file, then upload it here:
          </p>
          <ul className="text-xs space-y-1 mb-5" style={{ color: "var(--ink-dim)" }}>
            <li>
              <b style={{ color: "var(--ink)" }}>Android:</b> Contacts app → select the contacts → ⋮ menu → Share → Export as vCard (.vcf)
            </li>
            <li>
              <b style={{ color: "var(--ink)" }}>iPhone:</b> at icloud.com/contacts, select contacts → ⚙️ → Export vCard
            </li>
          </ul>
          <label className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: "1px solid var(--border)" }}>
            <Upload size={14} /> Choose .vcf file
            <input
              type="file"
              accept=".vcf,text/vcard,text/x-vcard"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {parseError && (
            <p className="text-xs mt-3 flex items-center gap-2" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={13} /> {parseError}
            </p>
          )}
        </>
      )}

      {parsed.length > 0 && (
        <>
          <p className="text-sm mb-3" style={{ color: "var(--ink)" }}>
            Found {parsed.length} contact{parsed.length === 1 ? "" : "s"} — pick which ones to import:
          </p>
          <div className="space-y-1.5 mb-4 max-h-[280px] overflow-y-auto">
            {parsed.map((c, i) => (
              <label key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--panel-2)" }}>
                <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))} />
                <div className="min-w-0">
                  <div style={{ color: "var(--ink)" }}>{c.name}</div>
                  <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                    {[c.phone, c.email, c.org].filter(Boolean).join(" · ") || "No details"}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Tag all imported contacts — target segment
              </label>
              <input list="segment-suggestions" value={batchTargetSegment} onChange={(e) => setBatchTargetSegment(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              <datalist id="segment-suggestions">
                {TARGET_SEGMENT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Tag all imported contacts — budget
              </label>
              <select value={batchBudgetTier} onChange={(e) => setBatchBudgetTier(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">Unknown</option>
                {BUDGET_TIERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} ({b.range})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button onClick={doImport} disabled={importing || selectedCount === 0} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            {importing ? "Importing…" : `Import ${selectedCount} contact${selectedCount === 1 ? "" : "s"}`}
          </button>
          {importError && (
            <p className="text-xs mt-3 flex items-center gap-2" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={13} /> {importError}
            </p>
          )}
        </>
      )}

      {result && (
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} color="var(--success)" className="mt-0.5 shrink-0" />
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            Imported {result.imported} contact{result.imported === 1 ? "" : "s"}
            {result.skipped > 0 ? `, skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}` : ""}. <a href="/app/contacts" style={{ color: "var(--cyan)" }}>View contacts →</a>
          </p>
        </div>
      )}
    </div>
  );
}
