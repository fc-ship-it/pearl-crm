import { getSession } from "@/lib/auth";
import { getOrganization } from "@/lib/data";
import { formatDate, BILLING_PLANS, billingPlanConfig } from "@/lib/domain";
import SubscribeButton from "@/components/SubscribeButton";
import ManageBillingButton from "@/components/ManageBillingButton";
import { Check, CheckCircle2, AlertTriangle, Info } from "lucide-react";

// One product, no feature tiers — every plan includes full, unlimited access.
// The only choice is billing frequency, so the same feature list is shown
// under all three cards rather than repeated per plan.
const INCLUDED_FEATURES = [
  "Unlimited users, contacts & pipeline",
  "All integrations — Gmail, Calendar, WhatsApp",
  "Campaigns, AI meeting minutes & reminders",
  "Lead scoring & statistics dashboard",
];

type PaymentMessage = { kind: "success" | "error" | "info"; text: string };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const org = (await getOrganization(session!.orgId))!;

  // By the time this page renders, /api/billing/stripe/confirm has already
  // synchronously reconciled the org's row with Stripe (see that route) —
  // no need to re-check a payment intent's status here like the old Ziina
  // page did. These query params are just which banner to show.
  let message: PaymentMessage | null = null;
  if (sp.paid === "1") {
    message = { kind: "success", text: "Payment received — your plan is active." };
  } else if (sp.canceled === "1") {
    message = { kind: "info", text: "Checkout canceled — you weren't charged." };
  }

  const activePlan = billingPlanConfig(org.billing_interval);
  const isTrial = org.subscription_status === "trialing";
  const isPastDue = org.subscription_status === "past_due";
  const hasStripeAccount = !!org.stripe_customer_id;

  return (
    <div className="max-w-[1100px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Plan & billing
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Flat, all-inclusive pricing: no hidden costs, no extra tools to pay for separately.
      </p>

      {message && (
        <div
          className="card p-3 mb-4 flex items-start gap-2"
          style={
            message.kind === "success"
              ? { background: "rgba(23,166,115,0.08)", border: "1px solid var(--success)" }
              : message.kind === "error"
              ? { background: "rgba(229,72,77,0.08)", border: "1px solid var(--danger)" }
              : { background: "var(--panel-2)" }
          }
        >
          {message.kind === "success" && <CheckCircle2 size={15} color="var(--success)" className="mt-0.5 shrink-0" />}
          {message.kind === "error" && <AlertTriangle size={15} color="var(--danger)" className="mt-0.5 shrink-0" />}
          {message.kind === "info" && <Info size={15} color="var(--ink-dim)" className="mt-0.5 shrink-0" />}
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {message.text}
          </p>
        </div>
      )}

      <div className="card p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Current status
          </div>
          <div className="font-display text-lg mt-1" style={{ color: "var(--ink)" }}>
            {isTrial ? "Free trial" : activePlan ? `${activePlan.label} plan` : org.plan}
          </div>
        </div>
        {isTrial && (
          <div className="text-sm text-right" style={{ color: "var(--ink-dim)" }}>
            Trial ends <span style={{ color: "var(--gold)" }}>{formatDate(org.trial_ends_at)}</span>
            {org.promo_bonus_days > 0 && (
              <div className="text-xs mt-1" style={{ color: "var(--success)" }}>
                +{org.promo_bonus_days} bonus days from promo code
              </div>
            )}
          </div>
        )}
        {!isTrial && org.billing_period_end && (
          <div className="text-sm text-right" style={{ color: "var(--ink-dim)" }}>
            {isPastDue ? (
              <span style={{ color: "var(--warning)" }}>Payment failed — we'll retry automatically. Update your card below if needed.</span>
            ) : org.stripe_cancel_at_period_end ? (
              <span style={{ color: "var(--warning)" }}>
                Cancels on <span style={{ color: "var(--gold)" }}>{formatDate(org.billing_period_end)}</span> — access continues until then.
              </span>
            ) : (
              <>
                Renews on <span style={{ color: "var(--gold)" }}>{formatDate(org.billing_period_end)}</span>
              </>
            )}
          </div>
        )}
        {hasStripeAccount && (
          <div>
            <ManageBillingButton />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BILLING_PLANS.map((p) => (
          <div
            key={p.id}
            className="card p-5"
            style={p.highlighted ? { border: "1px solid var(--gold)", background: "linear-gradient(180deg, rgba(212,168,67,0.08), var(--panel))" } : undefined}
          >
            <div className="text-sm flex items-center justify-between" style={{ color: "var(--ink-dim)" }}>
              {p.label}
              {activePlan?.id === p.id && !isTrial && (
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: "rgba(23,166,115,0.15)", color: "var(--success)" }}>
                  Current
                </span>
              )}
            </div>
            <div className="font-display text-2xl mt-1" style={{ color: "var(--ink)" }}>
              AED {p.amountAed} <span className="text-sm font-normal" style={{ color: "var(--ink-dim)" }}>{p.period}</span>
            </div>
            <p className="text-xs mt-1.5 mb-4" style={{ color: p.highlighted ? "var(--gold)" : "var(--ink-dim)" }}>
              {p.note}
            </p>
            <ul className="space-y-2 mb-5">
              {INCLUDED_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs" style={{ color: "var(--ink-dim)" }}>
                  <Check size={13} color="var(--success)" className="mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {activePlan?.id === p.id && !isTrial ? (
              hasStripeAccount && <ManageBillingButton label="Change or cancel" />
            ) : (
              <SubscribeButton interval={p.id} label={`AED ${p.amountAed}${p.period}`} highlighted={p.highlighted} />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--ink-dim)" }}>
        Payments are processed securely by Stripe. Your card is charged automatically at the end of the trial and on
        each renewal — cancel any time from "Manage billing" above and you won't be charged again.
      </p>
    </div>
  );
}
