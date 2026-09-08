"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

export default function IntegrationCard({
  provider,
  name,
  description,
  connected: initialConnected,
  connectedAt,
  color,
  icon,
  mode,
  detail,
  googleConfigured,
}: {
  provider: string;
  name: string;
  description: string;
  connected: boolean;
  connectedAt: string | null;
  color: string;
  icon: React.ReactNode;
  mode: "oauth" | "apikey";
  detail: string | null;
  googleConfigured: boolean;
}) {
  const [connected, setConnected] = useState(initialConnected);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function disconnect() {
    setLoading(true);
    await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, connected: false }),
    });
    setConnected(false);
    setLoading(false);
    router.refresh();
  }

  async function connectWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/integrations/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, phoneNumberId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Connessione fallita.");
      return;
    }
    setConnected(true);
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            {name}
          </div>
          <div className="text-xs" style={{ color: connected ? "var(--success)" : "var(--ink-dim)" }}>
            {connected ? detail || "Connected" : "Not connected"}
          </div>
        </div>
      </div>
      <p className="text-xs flex-1" style={{ color: "var(--ink-dim)" }}>
        {description}
      </p>

      {connected ? (
        <button
          onClick={disconnect}
          disabled={loading}
          className="mt-4 text-xs px-3 py-2 rounded-lg disabled:opacity-60"
          style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
        >
          Disconnect
        </button>
      ) : mode === "oauth" ? (
        <a
          href={`/api/integrations/google/connect`}
          className="mt-4 text-xs px-3 py-2 rounded-lg text-center disabled:opacity-60"
          style={
            googleConfigured
              ? { background: color, color: "var(--ink)" }
              : { background: "var(--panel-2)", color: "var(--ink-dim)", pointerEvents: "none" }
          }
          aria-disabled={!googleConfigured}
        >
          {googleConfigured ? "Connect with Google" : "Not configured yet"}
        </a>
      ) : showForm ? (
        <form onSubmit={connectWhatsApp} className="mt-4 space-y-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token (Meta for Developers)"
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={inputStyle}
          />
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Phone Number ID"
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={inputStyle}
          />
          {error && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !token || !phoneNumberId}
              className="flex-1 text-xs px-3 py-2 rounded-lg disabled:opacity-60"
              style={{ background: color, color: "var(--ink)" }}
            >
              {loading ? "Verifico…" : "Verify & connect"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
            >
              Annulla
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="mt-4 text-xs px-3 py-2 rounded-lg"
          style={{ background: color, color: "var(--ink)" }}
        >
          Connect
        </button>
      )}
    </div>
  );
}
