"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import type { DuplicateContactGroup } from "@/lib/data";

/**
 * "Possibili duplicati" — surfaces contacts that share a normalized email or
 * phone (see findDuplicateContactGroups in data.ts) and lets the user merge
 * each group down to one contact with a click. Loaded client-side (rather
 * than computed in the server component alongside the main contacts list)
 * so opening the Contacts page never waits on the duplicate scan — it's a
 * secondary, occasional-use tool, not something every page view needs.
 *
 * Collapsed by default once there's something to show, so it doesn't push
 * the actual contacts table down on every visit — this is a periodic
 * cleanup pass, not a per-visit concern.
 */
export default function DuplicateContactsPanel() {
  const router = useRouter();
  const [groups, setGroups] = useState<DuplicateContactGroup[] | null>(null);
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/contacts/duplicates")
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((data) => setGroups(data.groups || []))
      .catch(() => setGroups([]));
  }, []);

  function groupKey(g: DuplicateContactGroup) {
    return `${g.matchType}:${g.key}`;
  }

  function primaryFor(g: DuplicateContactGroup) {
    return primaryByGroup[groupKey(g)] || g.contacts[0].id;
  }

  async function merge(g: DuplicateContactGroup) {
    const primaryId = primaryFor(g);
    const duplicateIds = g.contacts.map((c) => c.id).filter((id) => id !== primaryId);
    if (duplicateIds.length === 0) return;
    setMerging(groupKey(g));
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, duplicateIds }),
      });
      if (res.ok) {
        setGroups((prev) => (prev || []).filter((gr) => groupKey(gr) !== groupKey(g)));
        router.refresh();
      }
    } finally {
      setMerging(null);
    }
  }

  if (groups === null || groups.length === 0) return null;

  return (
    <div className="card p-4 mb-4" style={{ borderColor: "rgba(212,168,67,0.35)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Users size={16} color="var(--gold)" />
        <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
          {groups.length} possibile{groups.length === 1 ? "" : "i"} duplicat{groups.length === 1 ? "o" : "i"}
        </span>
        <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
          — stesso telefono o email su più contatti
        </span>
        {open ? <ChevronUp size={16} className="ml-auto" color="var(--ink-dim)" /> : <ChevronDown size={16} className="ml-auto" color="var(--ink-dim)" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {groups.map((g) => {
            const key = groupKey(g);
            const primaryId = primaryFor(g);
            return (
              <div key={key} className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
                <div className="text-xs mb-2" style={{ color: "var(--ink-dim)" }}>
                  Stesso {g.matchType === "email" ? "email" : "telefono"}: <span className="font-mono">{g.key}</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {g.contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--ink)" }}>
                      <input
                        type="radio"
                        name={`primary-${key}`}
                        checked={primaryId === c.id}
                        onChange={() => setPrimaryByGroup((prev) => ({ ...prev, [key]: c.id }))}
                      />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
                        {c.email || "—"} · {c.phone || "—"} · {c.companyName || "nessuna azienda"} · {c.dealCount || 0} trattative
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] mb-2" style={{ color: "var(--ink-dim)" }}>
                  Il contatto selezionato resta; gli altri vengono eliminati e la loro storia (trattative, attività, promemoria) passa a lui.
                </p>
                <button
                  type="button"
                  onClick={() => merge(g)}
                  disabled={merging === key}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
                  style={{ background: "var(--gold)", color: "var(--ink)" }}
                >
                  {merging === key ? "Unione in corso…" : "Unisci"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
