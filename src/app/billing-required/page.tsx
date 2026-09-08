import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrganization, isAccessBlocked } from "@/lib/data";
import { BILLING_PLANS } from "@/lib/domain";
import SubscribeButton from "@/components/SubscribeButton";
import LogoutLink from "@/components/LogoutLink";
import { Check, PauseCircle } from "lucide-react";

const INCLUDED_FEATURES = [
  "Unlimited users, contacts & pipeline",
  "All integrations — Gmail, Calendar, WhatsApp",
  "Campaigns, AI meeting minutes & reminders",
  "Lead scoring & statistics dashboard",
];

/** Where a suspended org lands instead of /app/* — see the block in
 * src/app/app/layout.tsx. Nothing is deleted while access is paused;
 * picking a plan here and paying reactivates the account immediately. */
export default async function BillingRequiredPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const org = getOrganization(session.orgId);
  if (!org) redirect("/login");
  if (!isAccessBlocked(org)) redirect("/app/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-[720px] w-full">
        <div className="text-center mb-6">
          <PauseCircle size={32} color="var(--warning)" className="mx-auto mb-3" />
          <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            {org.name}'s Pearl access is paused
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--ink-dim)" }}>
            Nothing was deleted — pick a plan below and you're back in immediately after payment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {BILLING_PLANS.map((p) => (
            <div
              key={p.id}
              className="card p-5"
              style={p.highlighted ? { border: "1px solid var(--gold)", background: "linear-gradient(180deg, rgba(212,168,67,0.08), var(--panel))" } : undefined}
            >
              <div className="text-sm" style={{ color: "var(--ink-dim)" }}>
                {p.label}
              </div>
              <div className="font-display text-2xl mt-1" style={{ color: "var(--ink)" }}>
                AED {p.amountAed} <span className="text-sm font-normal" style={{ color: "var(--ink-dim)" }}>{p.period}</span>
              </div>
              <p className="text-xs mt-1.5 mb-4" style={{ color: p.highlighted ? "var(--gold)" : "var(--ink-dim)" }}>
                {p.note}
              </p>
              <ul className="space-y-1.5 mb-4">
                {INCLUDED_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--ink-dim)" }}>
                    <Check size={12} color="var(--success)" className="mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <SubscribeButton interval={p.id} label={`AED ${p.amountAed}${p.period}`} highlighted={p.highlighted} />
            </div>
          ))}
        </div>

        <div className="text-center">
          <LogoutLink />
        </div>
      </div>
    </div>
  );
}
