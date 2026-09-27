"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't reset your password.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Image src="/brand/pearl-logo-64.png" alt="" width={26} height={26} />
          <span className="font-display text-base" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
        </div>
        {!token ? (
          <div className="card p-6 space-y-3 text-center">
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              This link is missing its reset token — open it again from the email, or request a new one.
            </p>
            <Link href="/forgot-password" className="inline-block text-sm" style={{ color: "var(--cyan)" }}>
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="card p-6 space-y-3 text-center">
            <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
              Password updated
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Taking you to the login page…
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4">
            <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
              Choose a new password
            </h1>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                New password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Confirm new password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
