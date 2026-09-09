"use client";

import { useState } from "react";
import type { BillingIntervalId } from "@/lib/domain";

/** Kicks off a Stripe Checkout for one plan and redirects the browser to the
 * hosted payment page. Used on both the Plan & Billing settings page and
 * the /billing-required screen a suspended org lands on. */
export default function SubscribeButton({
  interval,
  label,
  highlighted,
}: {
  interval: BillingIntervalId;
  label: string;
  highlighted?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirect_url) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setError("Couldn't reach the payment provider. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={loading}
        className="w-full text-xs px-3 py-2.5 rounded-lg disabled:opacity-60"
        style={highlighted ? { background: "var(--gold)", color: "var(--ink)" } : { border: "1px solid var(--border)", color: "var(--ink)" }}
      >
        {loading ? "Redirecting to secure checkout…" : `Subscribe — ${label}`}
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
