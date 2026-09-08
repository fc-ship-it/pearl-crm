"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

export default function ChatWidget() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-50"
        style={{ background: "linear-gradient(135deg, var(--cyan), var(--magenta))" }}
      >
        <MessageCircle size={22} color="var(--ink)" />
      </button>
    );
  }
  return (
    <div className="fixed bottom-5 right-5 w-[260px] rounded-2xl p-4 shadow-2xl z-50" style={{ background: "#fff" }}>
      <button onClick={() => setOpen(false)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
        <X size={12} color="#111" />
      </button>
      <div className="flex items-start gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ background: "linear-gradient(135deg, var(--gold), var(--magenta))", color: "#fff" }}
        >
          FC
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: "#111" }}>
            Hi, Federica here! 👋
          </div>
          <div className="text-xs mt-1" style={{ color: "#555" }}>
            Got a question about Pearl? Ask away.
          </div>
        </div>
      </div>
    </div>
  );
}
