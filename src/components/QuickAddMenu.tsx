"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Users, Handshake, ListChecks, Video, X } from "lucide-react";
import { STAGES } from "@/lib/domain";
import SearchableSelect from "@/components/SearchableSelect";

type Tab = "contact" | "deal" | "task" | "meeting";
type LiteContact = { id: string; name: string };
type LiteDeal = { id: string; title: string; contactName?: string };

const OPEN_STAGE_OPTIONS = STAGES.filter((s) => s.weight > 0);

/**
 * The global "+" quick-add — one place, present on every /app page (it
 * lives in AppShell), to add a contact, a deal, a task, or a meeting
 * without hunting for the right page first. Contact and Meeting reuse
 * their existing full pages (QR scan, phone import, AI transcript — not
 * worth duplicating here); Deal and Task get a compact inline form since
 * neither had a dedicated page before. The forms are deliberately
 * interconnected: creating a deal lets you attach it to an existing
 * contact, and creating a task lets you attach it to a contact AND a deal,
 * so nothing gets created as an orphan record by default.
 */
export default function QuickAddMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("contact");
  const [contacts, setContacts] = useState<LiteContact[] | null>(null);
  const [deals, setDeals] = useState<LiteDeal[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open || contacts !== null) return;
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts || []))
      .catch(() => setContacts([]));
    fetch("/api/deals")
      .then((r) => r.json())
      .then((d) => setDeals(d.deals || []))
      .catch(() => setDeals([]));
  }, [open, contacts]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Quick add"
        aria-label="Quick add"
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--gold)", color: "var(--ink)" }}
      >
        <Plus size={17} />
      </button>

      {open && (
        // Full-width sheet under the header on phones (a 320px panel anchored
        // to a 32px button runs off the left edge of a narrow screen — this
        // is what "not optimized for mobile" was catching); the same
        // right-anchored 320px dropdown as before from `md:` up.
        <div
          className="fixed left-3 right-3 top-16 md:absolute md:left-auto md:right-0 md:top-11 md:w-[320px] max-h-[80vh] overflow-y-auto z-50 rounded-xl"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(21,27,46,0.18)" }}
        >
          <div className="flex items-center justify-between px-3 pt-3">
            <div className="flex gap-1 flex-wrap">
              <TabButton active={tab === "contact"} onClick={() => setTab("contact")} icon={<Users size={12} />} label="Contact" />
              <TabButton active={tab === "deal"} onClick={() => setTab("deal")} icon={<Handshake size={12} />} label="Deal" />
              <TabButton active={tab === "task"} onClick={() => setTab("task")} icon={<ListChecks size={12} />} label="Task" />
              <TabButton active={tab === "meeting"} onClick={() => setTab("meeting")} icon={<Video size={12} />} label="Meeting" />
            </div>
            <button onClick={close} aria-label="Close" style={{ color: "var(--ink-dim)" }}>
              <X size={14} />
            </button>
          </div>
          <div className="p-3">
            {tab === "contact" && (
              <RedirectPane
                text="Add a contact — manual entry, QR scan, or import from your phone."
                href="/app/contacts/new"
                cta="Open add-contact page"
                onNavigate={close}
              />
            )}
            {tab === "meeting" && (
              <RedirectPane
                text="Log an AI meeting — paste notes or a transcript and Pearl structures the minutes and next-step tasks."
                href="/app/meetings/new"
                cta="Open new-meeting page"
                onNavigate={close}
              />
            )}
            {tab === "deal" && <QuickDealForm contacts={contacts} onDone={close} router={router} />}
            {tab === "task" && <QuickTaskForm contacts={contacts} deals={deals} onDone={close} router={router} />}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold"
      style={active ? { background: "var(--panel-2)", color: "var(--ink)" } : { color: "var(--ink-dim)" }}
    >
      {icon} {label}
    </button>
  );
}

function RedirectPane({ text, href, cta, onNavigate }: { text: string; href: string; cta: string; onNavigate: () => void }) {
  return (
    <div>
      <p className="text-sm font-medium mb-3" style={{ color: "var(--ink)" }}>
        {text}
      </p>
      <Link
        href={href}
        onClick={onNavigate}
        className="block text-center w-full py-2.5 rounded-lg text-sm font-bold"
        style={{ background: "var(--gold)", color: "var(--ink)" }}
      >
        {cta}
      </Link>
    </div>
  );
}

// Bolder text + a darker border than the rest of the app's inputs — this
// compact panel was hard to read on a phone (light placeholder gray on a
// light field), so contrast here is deliberately turned up rather than
// reusing the standard (lighter) form-field look.
const inputStyle = { background: "var(--panel-2)", border: "1.5px solid var(--ink-dim)", color: "var(--ink)", fontWeight: 600 } as const;
const fieldClass = "w-full px-2.5 py-2 rounded-lg text-sm outline-none placeholder:text-[var(--ink-dim)] placeholder:font-medium";

function QuickDealForm({
  contacts,
  onDone,
  router,
}: {
  contacts: LiteContact[] | null;
  onDone: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState("lead");
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    setError("");
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, value: Number(value) || 0, stage, contactId: contactId || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
      return;
    }
    onDone();
    router.push("/app/pipeline");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Deal title *"
        className={fieldClass}
        style={inputStyle}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value (AED)"
          inputMode="numeric"
          className={fieldClass}
          style={inputStyle}
        />
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={fieldClass} style={inputStyle}>
          {OPEN_STAGE_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <SearchableSelect
        options={(contacts || []).map((c) => ({ id: c.id, label: c.name }))}
        value={contactId}
        onChange={setContactId}
        placeholder="Search contacts…"
        emptyLabel="No contact linked"
        inputStyle={inputStyle}
        className={fieldClass}
      />
      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
        {saving ? "Saving…" : "Add deal"}
      </button>
    </form>
  );
}

function QuickTaskForm({
  contacts,
  deals,
  onDone,
  router,
}: {
  contacts: LiteContact[] | null;
  deals: LiteDeal[] | null;
  onDone: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    setError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        // dueDate comes from a datetime-local input ("YYYY-MM-DDTHH:mm", no
        // timezone suffix) — JS parses that as LOCAL time, unlike a date-only
        // string (which parses as UTC midnight and silently loses the time
        // the user picked). That's the whole fix for the "orario non va bene"
        // report: switching the input type below is what makes this correct.
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        contactId: contactId || null,
        dealId: dealId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title *"
        className={fieldClass}
        style={inputStyle}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={fieldClass}
          style={inputStyle}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={fieldClass} style={inputStyle}>
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
      </div>
      <SearchableSelect
        options={(contacts || []).map((c) => ({ id: c.id, label: c.name }))}
        value={contactId}
        onChange={setContactId}
        placeholder="Search contacts…"
        emptyLabel="No contact linked"
        inputStyle={inputStyle}
        className={fieldClass}
      />
      <SearchableSelect
        options={(deals || []).map((d) => ({ id: d.id, label: d.title, sublabel: d.contactName }))}
        value={dealId}
        onChange={setDealId}
        placeholder="Search deals…"
        emptyLabel="No deal linked"
        inputStyle={inputStyle}
        className={fieldClass}
      />
      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
        {saving ? "Saving…" : "Add task"}
      </button>
    </form>
  );
}
