"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function OwnerLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/owner/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
      return;
    }
    router.push("/owner/dashboard");
    router.refresh();
  }

  const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2 justify-center mb-3">
          <Image src="/brand/pearl-logo-64.png" alt="" width={26} height={26} />
          <span className="font-display text-base" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
        </div>
        <p className="text-center text-xs mb-6" style={{ color: "var(--ink-dim)" }}>
          AHEAD LLC — owner access
        </p>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
            Owner login
          </h1>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            This is for AHEAD LLC only — to see and manage every business that signs up for Pearl. Not a customer
            login.
          </p>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Owner password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--gold)", color: "var(--ink)" }}
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
