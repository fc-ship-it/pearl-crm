"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck, User as UserIcon } from "lucide-react";
import type { TeamMember } from "@/lib/data";

const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

export default function TeamClient({ members, currentUserId }: { members: TeamMember[]; currentUserId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SALES">("SALES");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addTeammate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't add this teammate.");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setRole("SALES");
    setShowForm(false);
    router.refresh();
  }

  async function patchMember(id: string, body: Record<string, unknown>) {
    setLoading(true);
    await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card p-0 overflow-hidden">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          const deactivated = !!m.deactivatedAt;
          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 px-5 py-4 border-b last:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: m.role === "ADMIN" ? "rgba(201,162,39,0.18)" : "rgba(0,212,255,0.14)" }}
                >
                  {m.role === "ADMIN" ? <ShieldCheck size={16} color="var(--gold)" /> : <UserIcon size={16} color="#00d4ff" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {m.name} {isSelf && <span style={{ color: "var(--ink-dim)" }}>(you)</span>}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--ink-dim)" }}>
                    {m.email} · {m.role === "ADMIN" ? "Admin — sees everyone's pipeline" : "Sales — sees only their own"}
                    {deactivated && <span style={{ color: "var(--danger)" }}> · deactivated</span>}
                  </div>
                </div>
              </div>

              {!isSelf && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={m.role}
                    disabled={loading}
                    onChange={(e) => patchMember(m.id, { action: "setRole", role: e.target.value })}
                    className="text-xs px-2 py-1.5 rounded-lg outline-none disabled:opacity-60"
                    style={inputStyle}
                  >
                    <option value="SALES">Sales</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    onClick={() => patchMember(m.id, { action: deactivated ? "reactivate" : "deactivate" })}
                    disabled={loading}
                    className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
                  >
                    {deactivated ? "Reactivate" : "Deactivate"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm ? (
        <form onSubmit={addTeammate} className="card p-5 space-y-3 max-w-md">
          <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            Add a teammate
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Initial password (min. 6 characters)"
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Share this password with them directly — there is no invite email yet. They can log in right away and
            connect their own Gmail/Outlook from Settings → Integrations.
          </p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "ADMIN" | "SALES")}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            <option value="SALES">Sales — sees only their own contacts/deals</option>
            <option value="ADMIN">Admin — sees the whole team&apos;s pipeline</option>
          </select>
          {error && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !name || !email || password.length < 6}
              className="flex-1 text-sm px-3 py-2 rounded-lg disabled:opacity-60"
              style={{ background: "var(--gold)", color: "var(--ink)" }}
            >
              {loading ? "Adding…" : "Add teammate"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-3 py-2 rounded-lg"
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          <UserPlus size={16} /> Add teammate
        </button>
      )}
    </div>
  );
}
