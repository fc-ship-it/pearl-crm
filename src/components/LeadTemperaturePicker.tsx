"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAD_TEMPERATURES } from "@/lib/domain";

/** Small "how hot is this lead" selector — three chips (Hot/Warm/Cold), any
 * one active at a time, click to change or click again to clear. Used on the
 * contact detail page and inline in the contacts table. */
export default function LeadTemperaturePicker({
  contactId,
  value,
  size = "md",
}: {
  contactId: string;
  value: "hot" | "warm" | "cold" | null;
  size?: "sm" | "md";
}) {
  const [current, setCurrent] = useState(value);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function pick(id: "hot" | "warm" | "cold") {
    const next = current === id ? null : id;
    setCurrent(next);
    startTransition(async () => {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature: next }),
      });
      router.refresh();
    });
  }

  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <div className="flex items-center gap-1" style={{ opacity: isPending ? 0.6 : 1 }}>
      {LEAD_TEMPERATURES.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick(t.id);
            }}
            title={`${t.label} lead`}
            className={`rounded-full font-medium transition-transform ${padding}`}
            style={{
              background: active ? `${t.color}22` : "var(--panel-2)",
              color: active ? t.color : "var(--ink-dim)",
              border: `1px solid ${active ? t.color : "var(--border)"}`,
              transform: active ? "scale(1.04)" : "scale(1)",
            }}
          >
            {t.emoji} {t.label}
          </button>
        );
      })}
    </div>
  );
}
