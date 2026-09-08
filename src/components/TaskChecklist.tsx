"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { TaskRow } from "@/lib/data";

export default function TaskChecklist({ tasks }: { tasks: TaskRow[] }) {
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});
  const router = useRouter();

  async function toggle(id: string, current: boolean) {
    setLocalDone((s) => ({ ...s, [id]: !current }));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !current }),
    });
    router.refresh();
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
        No open tasks. 🎉
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const done = localDone[t.id] ?? t.done;
        return (
          <div key={t.id} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--panel-2)" }}>
            <button
              onClick={() => toggle(t.id, done)}
              className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0"
              style={{
                border: `1px solid ${done ? "var(--success)" : "var(--border)"}`,
                background: done ? "var(--success)" : "transparent",
              }}
            >
              {done && <Check size={11} color="var(--ink)" />}
            </button>
            <div className="min-w-0">
              <div
                className="text-sm truncate"
                style={{ color: done ? "var(--ink-dim)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}
              >
                {t.title}
              </div>
              {t.contactName && (
                <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  {t.contactName}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
