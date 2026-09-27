"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ExternalLink, Pencil } from "lucide-react";
import { googleMapsSearchUrl } from "@/lib/domain";

/** Inline address display + editor on the contact detail page — shows the
 * "Open in Google Maps" link when an address is set, and a small edit
 * affordance either way (same PATCH-on-change pattern as LeadTemperaturePicker). */
export default function ContactAddressEditor({ contactId, value }: { contactId: string; value: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    const next = draft.trim();
    setEditing(false);
    startTransition(async () => {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: next || null }),
      });
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="E.g. Sheikh Zayed Rd, Dubai"
          className="px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        />
        <button type="button" onClick={save} className="text-xs" style={{ color: "var(--gold)" }}>
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1" style={{ opacity: isPending ? 0.6 : 1 }}>
      {value ? (
        <a
          href={googleMapsSearchUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs flex items-center gap-1"
          style={{ color: "var(--cyan)" }}
        >
          <MapPin size={12} /> {value} <ExternalLink size={10} />
        </a>
      ) : (
        <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
          No address yet
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(value || "");
          setEditing(true);
        }}
        title="Edit address"
        style={{ color: "var(--ink-dim)" }}
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}
