"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal } from "@/lib/data";
import SearchableSelect from "@/components/SearchableSelect";
import { MEETING_LOCATION_TYPES, meetingLocationTypeConfig, type MeetingLocationTypeId } from "@/lib/domain";

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for the datetime-local
 * input's default value — so a new meeting defaults to "now" exactly like
 * before this field existed, rather than opening on an empty date. */
function nowForDateTimeLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function NewMeetingForm({ contacts, deals }: { contacts: Contact[]; deals: Deal[] }) {
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id || "");
  const [dealId, setDealId] = useState("");
  const [date, setDate] = useState(nowForDateTimeLocal);
  const [locationType, setLocationType] = useState<MeetingLocationTypeId | "">("");
  const [locationDetail, setLocationDetail] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const availableDeals = deals.filter((d) => d.contactId === contactId);
  const locationConfig = meetingLocationTypeConfig(locationType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        contactId,
        dealId: dealId || null,
        // datetime-local has no timezone suffix, so it parses as local time
        // (unlike a date-only string, which JS parses as UTC midnight).
        date: date ? new Date(date).toISOString() : null,
        locationType: locationType || null,
        locationDetail: locationType ? locationDetail || null : null,
        transcript,
      }),
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Contact
          </label>
          <SearchableSelect
            options={contacts.map((c) => ({ id: c.id, label: c.name }))}
            value={contactId}
            onChange={(id) => {
              setContactId(id);
              setDealId("");
            }}
            placeholder="Search contacts…"
            inputStyle={inputStyle}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          />
        </div>
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Linked opportunity (optional)
          </label>
          <SearchableSelect
            options={availableDeals.map((d) => ({ id: d.id, label: d.title }))}
            value={dealId}
            onChange={setDealId}
            placeholder="Search deals…"
            emptyLabel="— None —"
            inputStyle={inputStyle}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Date & time
          </label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            How
          </label>
          <select
            value={locationType}
            onChange={(e) => {
              setLocationType(e.target.value as MeetingLocationTypeId | "");
              setLocationDetail("");
            }}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            <option value="">— Not set —</option>
            {MEETING_LOCATION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {locationConfig && (
        <div>
          <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
            {locationConfig.detailLabel}
          </label>
          <input
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
            placeholder={locationConfig.detailPlaceholder}
          />
        </div>
      )}
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
