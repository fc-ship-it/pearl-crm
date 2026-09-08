"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
      return;
    }
    router.push(params.get("next") || "/app/dashboard");
    router.refresh();
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
        <form onSubmit={submit} className="card p-6 space-y-4">
          <h1 className="font-display text-lg" style={{ color: "var(--ink)" }}>
            Log in
          </h1>
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
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--ink)" }}>
            {loading ? "Logging in…" : "Log in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("demo@pearlcrm.ae");
              setPassword("demo1234");
            }}
            className="w-full py-2 rounded-xl text-xs"
            style={{ border: "1px solid var(--border)", color: "var(--ink-dim)" }}
          >
            Use demo credentials
          </button>
        </form>
        <p className="text-center text-sm mt-4" style={{ color: "var(--ink-dim)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color: "var(--cyan)" }}>
            Try it free for 7 days
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
