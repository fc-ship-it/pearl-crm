"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
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
        {sent ? (
          <div className="card p-6 space-y-3 text-center">
            <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
              Check your email
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It
              works once and expires in an hour.
            </p>
            <Link href="/login" className="inline-block text-sm mt-2" style={{ color: "var(--cyan)" }}>
              Back to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4">
            <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
              Reset your password
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Enter the email you signed up with — we&apos;ll send you a link to choose a new password.
            </p>
            <div>
              <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--gold)", color: "var(--ink)" }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="text-center text-sm" style={{ color: "var(--ink-dim)" }}>
              <Link href="/login" style={{ color: "var(--cyan)" }}>
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
