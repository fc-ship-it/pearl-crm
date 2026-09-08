"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, CheckCircle2, Clock, Megaphone, BellRing, Phone, CalendarClock, StickyNote } from "lucide-react";
import type { Campaign, CustomAlert } from "@/lib/data";
import { BUDGET_TIERS, CAMPAIGN_CHANNELS, formatDate } from "@/lib/domain";

const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

const ALERT_KIND_META: Record<string, { label: string; icon: any }> = {
  general: { label: "Reminder", icon: StickyNote },
  call: { label: "Call", icon: Phone },
  appointment: { label: "Appointment", icon: CalendarClock },
};

export default function CampaignsBoard({
  campaigns,
  alerts,
  segments,
  contacts = [],
}: {
  campaigns: Campaign[];
  alerts: CustomAlert[];
  segments: string[];
  contacts?: { id: string; name: string }[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <CampaignsPanel campaigns={campaigns} segments={segments} />
      </div>
      <div>
        <AlertsPanel alerts={alerts} contacts={contacts} />
      </div>
    </div>
  );
}

function CampaignsPanel({ campaigns, segments }: { campaigns: Campaign[]; segments: string[] }) {
  const [showForm, setShowForm] = useState(campaigns.length === 0);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [interest, setInterest] = useState("");
  const [budgetTier, setBudgetTier] = useState("");
  const [targetSegment, setTargetSegment] = useState("");
  const [audience, setAudience] = useState<{ count: number; names: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handle = setTimeout(async () => {
      const res = await fetch("/api/campaigns/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interest, budgetTier, targetSegment }),
      });
      if (res.ok) setAudience(await res.json());
    }, 350);
    return () => clearTimeout(handle);
  }, [interest, budgetTier, targetSegment]);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError("Title and message are required.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, channel, interest, budgetTier, targetSegment }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong while creating the campaign.");
      return;
    }
    setTitle("");
    setMessage("");
    setInterest("");
    setBudgetTier("");
    setTargetSegment("");
    setShowForm(false);
    router.refresh();
  }

  async function send(id: string) {
    setSendingId(id);
    setSendResult(null);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setSendingId(null);
    if (data?.delivery) {
      const d = data.delivery;
      if (d.simulated) {
        setSendResult("Registrata come inviata. Collega Gmail o WhatsApp in Settings → Integrations per un invio reale.");
      } else {
        setSendResult(
          `Inviata a ${d.delivered} contatt${d.delivered === 1 ? "o" : "i"}` +
            (d.skipped ? `, ${d.skipped} saltati (mancava email/telefono o l'integrazione non è connessa)` : "") +
            (d.failed ? `, ${d.failed} falliti` : "") +
            "."
        );
      }
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm flex items-center gap-2" style={{ color: "var(--ink)" }}>
          <Megaphone size={15} color="var(--gold)" /> Campaigns
        </h2>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--gold)", color: "var(--ink)" }}>
          <Plus size={13} /> New campaign
        </button>
      </div>

      {showForm && (
        <form onSubmit={createCampaign} className="card p-5 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Campaign title
              </label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="E.g. Ramadan hospitality offer" className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Channel
              </label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                {CAMPAIGN_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Message
            </label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Write the promotional message…" className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>

          <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-xs mb-2" style={{ color: "var(--ink-dim)" }}>
              Target audience — leave blank to match everyone
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Interest contains…" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              <select value={budgetTier} onChange={(e) => setBudgetTier(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">Any budget</option>
                {BUDGET_TIERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} budget
                  </option>
                ))}
              </select>
              <select value={targetSegment} onChange={(e) => setTargetSegment(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">Any segment</option>
                {segments.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--cyan)" }}>
              {audience ? `Matches ${audience.count} contact${audience.count === 1 ? "" : "s"}${audience.names.length ? ` — ${audience.names.join(", ")}${audience.count > audience.names.length ? "…" : ""}` : ""}` : "Checking audience…"}
            </p>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            {saving ? "Saving…" : "Save as draft"}
          </button>
        </form>
      )}

      {sendResult && (
        <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
          {sendResult}
        </p>
      )}

      <div className="space-y-2">
        {campaigns.length === 0 && !showForm && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            No campaigns yet.
          </p>
        )}
        {campaigns.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm" style={{ color: "var(--ink)" }}>
                    {c.title}
                  </span>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
                    {c.channel}
                  </span>
                  <span
                    className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                    style={c.status === "sent" ? { background: "rgba(23,166,115,0.15)", color: "var(--success)" } : { background: "rgba(224,151,46,0.15)", color: "var(--warning)" }}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--ink-dim)" }}>
                  {c.message}
                </p>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {c.segmentInterest && <SegBadge label={`Interest: ${c.segmentInterest}`} />}
                  {c.segmentBudgetTier && <SegBadge label={`${c.segmentBudgetTier} budget`} />}
                  {c.segmentTargetSegment && <SegBadge label={c.segmentTargetSegment} />}
                  {!c.segmentInterest && !c.segmentBudgetTier && !c.segmentTargetSegment && <SegBadge label="All contacts" />}
                </div>
              </div>
              <div className="text-right shrink-0">
                {c.status === "sent" ? (
                  <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                    Sent to {c.recipientCount} · {c.sentAt ? formatDate(c.sentAt) : ""}
                  </div>
                ) : (
                  <button
                    onClick={() => send(c.id)}
                    disabled={sendingId === c.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                    style={{ background: "var(--gold)", color: "var(--ink)" }}
                  >
                    <Send size={12} /> {sendingId === c.id ? "Sending…" : "Send now"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(15,181,166,0.12)", color: "var(--cyan)" }}>
      {label}
    </span>
  );
}

function AlertsPanel({ alerts, contacts }: { alerts: CustomAlert[]; contacts: { id: string; name: string }[] }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [kind, setKind] = useState<"general" | "call" | "appointment">("general");
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !remindAt) return;
    setSaving(true);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, remindAt, kind, contactId: contactId || null }),
    });
    setSaving(false);
    setTitle("");
    setRemindAt("");
    setKind("general");
    setContactId("");
    setShowForm(false);
    router.refresh();
  }

  async function toggle(id: string, done: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    router.refresh();
  }

  const now = Date.now();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm flex items-center gap-2" style={{ color: "var(--ink)" }}>
          <BellRing size={15} color="var(--gold)" /> Custom alerts
        </h2>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: "var(--panel-2)", color: "var(--ink)" }}>
          <Plus size={13} />
        </button>
      </div>

      {showForm && (
        <form onSubmit={createAlert} className="card p-4 mb-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to…" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as "general" | "call" | "appointment")} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              {Object.entries(ALERT_KIND_META).map(([id, meta]) => (
                <option key={id} value={id}>
                  {meta.label}
                </option>
              ))}
            </select>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">No contact linked</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          <button type="submit" disabled={saving} className="w-full py-2 rounded-lg text-xs font-medium disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            {saving ? "Saving…" : "Set reminder"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {alerts.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            No custom alerts scheduled.
          </p>
        )}
        {alerts.map((a) => {
          const due = !a.done && new Date(a.remindAt).getTime() <= now;
          const meta = ALERT_KIND_META[a.kind] || ALERT_KIND_META.general;
          const KindIcon = meta.icon;
          return (
            <div key={a.id} className="card p-3 flex items-start gap-2" style={a.done ? { opacity: 0.5 } : due ? { border: "1px solid var(--warning)" } : undefined}>
              <button onClick={() => toggle(a.id, !a.done)} className="mt-0.5 shrink-0">
                <CheckCircle2 size={16} color={a.done ? "var(--success)" : "var(--ink-dim)"} />
              </button>
              <div className="min-w-0">
                <div className="text-xs flex items-center gap-1.5" style={{ color: "var(--ink)", textDecoration: a.done ? "line-through" : "none" }}>
                  <KindIcon size={11} color="var(--cyan)" />
                  {a.title}
                  {a.contactName && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
                      {a.contactName}
                    </span>
                  )}
                </div>
                <div className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: due ? "var(--warning)" : "var(--ink-dim)" }}>
                  <Clock size={10} /> {meta.label} · {formatDate(a.remindAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
