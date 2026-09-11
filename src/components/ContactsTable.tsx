"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { formatCurrency, relativeDaysLabel, initials, avatarColor, budgetTierConfig, contactSourceConfig } from "@/lib/domain";
import type { Contact } from "@/lib/data";
import LeadTemperaturePicker from "@/components/LeadTemperaturePicker";
import DeleteContactButton from "@/components/DeleteContactButton";

/**
 * The contacts table, plus a "select many, delete" bar above it. Exists as
 * its own client component (rather than living inline in the server-rendered
 * page) purely because selection needs to live in browser state — the table
 * markup itself is otherwise the same as before.
 *
 * This is what makes cleaning up a mass-import (e.g. someone's whole phone
 * address book brought in through the Contact Picker) a two-click job —
 * "Select all" then "Delete selected" — instead of opening and deleting
 * every contact one at a time.
 */
export default function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Delete ${count} contact${count === 1 ? "" : "s"}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setDeleting(false);
      if (!res.ok) return;
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch {
      setDeleting(false);
    }
  }

  const rows = useMemo(() => contacts, [contacts]);

  return (
    <div>
      {someSelected && (
        <div
          className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "rgba(212,168,67,0.12)", border: "1px solid rgba(212,168,67,0.35)", color: "var(--ink)" }}
        >
          <span>
            {selected.size} of {contacts.length} selected
          </span>
          <button type="button" onClick={toggleAll} className="text-xs underline" style={{ color: "var(--cyan)" }}>
            {allSelected ? "Deselect all" : `Select all ${contacts.length}`}
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={deleting || isPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
            style={{ background: "var(--danger, #e5484d)", color: "#fff" }}
          >
            <Trash2 size={13} /> {deleting || isPending ? "Deleting…" : `Delete selected (${selected.size})`}
          </button>
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3" style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all contacts" />
              </th>
              {["Contact", "Company", "Qualification", "Lead", "Open deals", "Value", "Last interaction", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-normal whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const tier = budgetTierConfig(c.budgetTier);
              const src = contactSourceConfig(c.source);
              return (
                <tr key={c.id} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Select ${c.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: avatarColor(c.name), color: "var(--ink)" }}
                      >
                        {initials(c.name)}
                      </div>
                      <div>
                        <div style={{ color: "var(--ink)" }}>{c.name}</div>
                        <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                          {c.email}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                    {c.companyName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.targetSegment && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
                          {c.targetSegment}
                        </span>
                      )}
                      {tier && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: `${tier.color}22`, color: tier.color }}>
                          {tier.label} budget
                        </span>
                      )}
                    </div>
                    {c.interest && (
                      <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                        {c.interest}
                      </div>
                    )}
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--ink-dim)", opacity: 0.7 }}>
                      {src.label}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <LeadTemperaturePicker contactId={c.id} value={c.temperature} size="sm" />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                    {c.dealCount || 0}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: "var(--gold)" }}>
                    {formatCurrency(c.dealValue || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                    {c.lastInteractionAt ? relativeDaysLabel(c.lastInteractionAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteContactButton contactId={c.id} contactName={c.name} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: "var(--ink-dim)" }}>
                  No contacts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
