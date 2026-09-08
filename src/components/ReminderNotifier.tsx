"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Phone, CalendarClock, StickyNote } from "lucide-react";
import type { CustomAlert } from "@/lib/data";

const KIND_META: Record<string, { label: string; icon: any }> = {
  general: { label: "Reminder", icon: StickyNote },
  call: { label: "Call", icon: Phone },
  appointment: { label: "Appointment", icon: CalendarClock },
};

const POLL_MS = 30_000;

/**
 * Polls /api/alerts for the org's open reminders/calls/appointments and:
 *  - fires a real browser Notification the moment one becomes due (once per alert),
 *  - shows a small bell dropdown in the header listing everything currently due.
 * Notification permission is requested lazily on first mount, never blocking render.
 */
export default function ReminderNotifier() {
  const [alerts, setAlerts] = useState<CustomAlert[]>([]);
  const [open, setOpen] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/alerts");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const open: CustomAlert[] = data.alerts || [];
        if (cancelled) return;
        setAlerts(open);

        const now = Date.now();
        for (const a of open) {
          const due = new Date(a.remindAt).getTime() <= now;
          if (due && !notifiedRef.current.has(a.id)) {
            notifiedRef.current.add(a.id);
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              const meta = KIND_META[a.kind] || KIND_META.general;
              new Notification(`Pearl · ${meta.label}`, {
                body: a.contactName ? `${a.title} — ${a.contactName}` : a.title,
                tag: a.id,
              });
            }
          }
        }
      } catch {
        // Network hiccups are fine to ignore — next poll will retry.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const now = Date.now();
  const due = alerts.filter((a) => new Date(a.remindAt).getTime() <= now);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative"
        aria-label="Reminders"
        title="Reminders"
      >
        <Bell size={18} color="var(--ink-dim)" />
        {due.length > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            {due.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 w-72 rounded-xl p-2 z-20 card"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="text-xs px-2 py-1.5" style={{ color: "var(--ink-dim)" }}>
              {due.length === 0 ? "Nothing due right now" : `${due.length} due now`}
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {alerts.length === 0 && (
                <div className="text-xs px-2 py-2" style={{ color: "var(--ink-dim)" }}>
                  No open reminders.
                </div>
              )}
              {alerts.map((a) => {
                const meta = KIND_META[a.kind] || KIND_META.general;
                const Icon = meta.icon;
                const isDue = new Date(a.remindAt).getTime() <= now;
                return (
                  <div
                    key={a.id}
                    className="px-2 py-2 rounded-lg text-xs flex items-start gap-2"
                    style={{ background: isDue ? "rgba(224,151,46,0.1)" : "transparent" }}
                  >
                    <Icon size={13} color={isDue ? "var(--warning)" : "var(--ink-dim)"} className="shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div style={{ color: "var(--ink)" }}>{a.title}</div>
                      <div style={{ color: "var(--ink-dim)" }}>
                        {meta.label}
                        {a.contactName ? ` · ${a.contactName}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link
              href="/app/campaigns"
              onClick={() => setOpen(false)}
              className="block text-center text-xs mt-1 px-2 py-1.5 rounded-lg"
              style={{ color: "var(--cyan)" }}
            >
              Manage all reminders →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
