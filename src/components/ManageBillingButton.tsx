"use client";

import { useState } from "react";

/** Sends the org to Stripe's hosted Customer Portal — update card, see past
 * invoices, cancel or resume a subscription. Only rendered when the org
 * already has a stripe_customer_id (see settings/billing/page.tsx). */
export default function ManageBillingButton({ label = "Manage billing" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirect_url) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setError("Couldn't reach the billing portal. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={loading}
        className="w-full text-xs px-3 py-2.5 rounded-lg disabled:opacity-60"
        style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
      >
        {loading ? "Opening…" : label}
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
