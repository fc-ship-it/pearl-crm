"use client";

import { useState } from "react";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";

function SignupForm() {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName, name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.redirect_url) {
      setLoading(false);
      setError(data.error || "Something went wrong while signing up.");
      return;
    }
    // Off to Stripe Checkout to add a card — the account already exists and
    // is logged in, but stays locked (see isAccessBlocked) until Checkout
    // confirms the card, which is when the 7-day trial actually starts.
    window.location.href = data.redirect_url;
  }

  const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Image src="/brand/pearl-logo-64.png" alt="" width={26} height={26} />
          <span className="font-display text-base" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
              7-day free trial
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
              A card is required to start — you won't be charged until the trial ends, and you can cancel any time before then.
            </p>
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Company name
            </label>
            <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Your name
            </label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Email
            </label>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Password
            </label>
            <input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            {loading ? "Redirecting to secure checkout…" : "Continue to add card"}
          </button>
        </form>
        <p className="text-center text-sm mt-4" style={{ color: "var(--ink-dim)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--cyan)" }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
