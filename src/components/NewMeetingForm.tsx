"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal } from "@/lib/data";

export default function NewMeetingForm({ contacts, deals }: { contacts: Contact[]; deals: Deal[] }) {
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id || "");
  const [dealId, setDealId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const availableDeals = deals.filter((d) => d.contactId === contactId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contactId, dealId: dealId || null, transcript }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong while creating the meeting.");
      return;
    }
    const data = await res.json();
    router.push(`/app/meetings/${data.meetingId}`);
    router.refresh();
  }

  const inputStyle = {
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    color: "var(--ink)",
  } as const;

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <div>
        <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Meeting title
        </label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={inputStyle}
          placeholder="E.g. Proposal alignment call"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Contact
          </label>
          <select
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              setDealId("");
            }}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Linked opportunity (optional)
          </label>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
            <option value="">— None —</option>
            {availableDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Notes / transcript / agenda
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={inputStyle}
          placeholder={
            "Paste free-form notes, a transcript, or write it point by point here.\n\nE.g.:\nWe discussed the budget available for Q3.\nThe client is hesitant about the price compared to competitors.\nWe decided to proceed with a technical demo.\nNext step: send the contract by Friday."
          }
        />
        <p className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
          The structured minutes (key points, decisions, objections, next steps → tasks) are generated automatically from this text.
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--gold)", color: "var(--ink)" }}
      >
        {loading ? "Generating minutes…" : "Generate AI minutes"}
      </button>
    </form>
  );
}
