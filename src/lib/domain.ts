// Shared domain constants and pure functions (stage config, urgency scoring,
// formatting). Kept framework-free so they're trivial to unit test later.

/** One product, three billing cadences (see /app/settings/billing) — the
 * canonical prices and period lengths live here so the pricing page and the
 * Stripe checkout/webhook code can't drift apart. `stripeInterval` is the
 * recurring interval passed straight to Stripe's Checkout Session
 * (`price_data.recurring.interval`) — see src/lib/stripe.ts. */
export const BILLING_PLANS = [
  { id: "weekly", label: "Weekly", amountAed: 24, days: 7, period: "/week", stripeInterval: "week", note: "Auto-renews every week — cancel any time.", highlighted: false },
  { id: "monthly", label: "Monthly", amountAed: 80, days: 30, period: "/month", stripeInterval: "month", note: "Auto-renews every month — cancel any time.", highlighted: true },
  { id: "annual", label: "Annual", amountAed: 800, days: 365, period: "/year", stripeInterval: "year", note: "2 months free vs. paying monthly (AED 960/year). Auto-renews yearly.", highlighted: false },
] as const;
export type BillingIntervalId = (typeof BILLING_PLANS)[number]["id"];
export function billingPlanConfig(id: string | null | undefined) {
  return BILLING_PLANS.find((p) => p.id === id) ?? null;
}
/** Grace period used only for a manually-granted plan (Owner Dashboard →
 * bank transfer / cash) — the true Ziina/Stripe checkout path relies on the
 * gateway's own status instead. Kept for that one manual code path. */
export const BILLING_GRACE_DAYS = 3;

export const STAGES = [
  { id: "lead", label: "Lead", weight: 0.6, color: "#7c86a3" },
  { id: "contacted", label: "Contacted", weight: 0.8, color: "#2dd4c4" },
  { id: "qualified", label: "Qualified", weight: 1.0, color: "#3b5bdb" },
  { id: "proposal", label: "Proposal", weight: 1.3, color: "#c9a227" },
  { id: "negotiation", label: "Negotiation", weight: 1.6, color: "#1f8fae" },
  { id: "closed_won", label: "Closed won", weight: 0, color: "#17a673" },
  { id: "closed_lost", label: "Closed lost", weight: 0, color: "#9b93b0" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const OPEN_STAGES: StageId[] = ["lead", "contacted", "qualified", "proposal", "negotiation"];

export function stageConfig(stage: string) {
  return STAGES.find((s) => s.id === stage) ?? STAGES[0];
}

export function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / (24 * 3600 * 1000)));
}

export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (24 * 3600 * 1000));
}

/**
 * Urgency score, exactly per the product spec: silence time × value ×
 * stage weight. Deals already closed (won/lost) never generate alerts.
 */
export function urgencyScore(params: { lastInteractionAt: string; value: number; stage: string }): number {
  const weight = stageConfig(params.stage).weight;
  if (weight === 0) return 0;
  const silence = daysSince(params.lastInteractionAt);
  return silence * (params.value / 110000) * weight;
}

export function urgencyLevel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 18) return "critical";
  if (score >= 9) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export const URGENCY_COLORS: Record<ReturnType<typeof urgencyLevel>, string> = {
  critical: "#e5484d",
  high: "#e0972e",
  medium: "#2dd4c4",
  low: "#9b93b0",
};

/**
 * Deterministic currency formatter — AED, e.g. "AED 8,200".
 *
 * Deliberately NOT `Intl.NumberFormat(...)`: Node's bundled ICU data can
 * silently omit a locale's grouping pattern (varies by build/distro), while
 * browsers always have it — so server-rendered HTML and the client's
 * hydration pass can disagree on the very first render and React throws a
 * hydration-mismatch error. A manual formatter is identical on every
 * runtime, which is what actually matters here.
 */
export function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}AED ${grouped}`;
}

/** Same rationale as {@link formatCurrency}: no `Intl`, so SSR and hydration always agree. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Manual formatter for the same SSR/hydration-consistency reason as above. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDaysLabel(iso: string): string {
  const d = daysSince(iso);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export const ACTIVITY_LABELS: Record<string, { label: string; icon: string }> = {
  email: { label: "Email", icon: "mail" },
  call: { label: "Call", icon: "phone" },
  whatsapp: { label: "WhatsApp", icon: "message-circle" },
  meeting: { label: "Meeting", icon: "users" },
  note: { label: "Note", icon: "sticky-note" },
};

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const AVATAR_PALETTE = ["#c9a227", "#2dd4c4", "#3b5bdb", "#1f8fae", "#17a673", "#e0972e"];
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Lead qualification: budget tier is a coarse bucket rather than an exact
 * figure, since at the top of the funnel (a scanned business card, an
 * imported phone contact) an exact budget is rarely known yet.
 */
export const BUDGET_TIERS = [
  { id: "low", label: "Low", range: "< AED 50k", color: "#9b93b0" },
  { id: "medium", label: "Medium", range: "AED 50k – 250k", color: "#2dd4c4" },
  { id: "high", label: "High", range: "> AED 250k", color: "#c9a227" },
] as const;
export type BudgetTierId = (typeof BUDGET_TIERS)[number]["id"];
export function budgetTierConfig(id: string | null | undefined) {
  return BUDGET_TIERS.find((b) => b.id === id) ?? null;
}

/** Common target-segment suggestions shown as datalist options; free text is also accepted. */
export const TARGET_SEGMENT_SUGGESTIONS = [
  "Hospitality",
  "Manufacturing",
  "Retail",
  "Industrial",
  "Venture / Tech",
  "Government",
  "SMB",
  "Enterprise",
];

/** Where a contact record came from — shown as a small provenance badge on the contact. */
export const CONTACT_SOURCES: Record<string, { label: string; icon: string }> = {
  manual: { label: "Added manually", icon: "user-plus" },
  qr: { label: "Scanned QR code", icon: "qr-code" },
  "whatsapp-qr": { label: "WhatsApp QR code", icon: "message-circle" },
  import: { label: "Imported from device", icon: "download" },
};
export function contactSourceConfig(source: string | null | undefined) {
  return CONTACT_SOURCES[source || "manual"] ?? CONTACT_SOURCES.manual;
}

/** Fixed category order + colors for the "contacts by source" chart on the
 * Statistics page. Order is fixed (never re-sorted by count) so a color always
 * means the same source. Palette validated with the dataviz skill's
 * validate_palette.js (light mode, categorical, 4 slots — all checks pass;
 * the gold slot carries a WARN on surface contrast, so it always ships with
 * a direct text label, never as a color-only cue). */
export const CONTACT_SOURCE_ORDER = ["manual", "qr", "whatsapp-qr", "import"] as const;
export const CONTACT_SOURCE_COLORS: Record<string, string> = {
  manual: "#c9a227",
  qr: "#1f9d90",
  "whatsapp-qr": "#3b5bdb",
  import: "#178a5e",
};

/** How "hot" a lead is — set manually by the sales rep, shown as a flame badge
 * everywhere the contact appears. Colors reuse the app's existing danger/
 * warning/link tokens so no new palette is introduced. */
export const LEAD_TEMPERATURES = [
  { id: "hot", label: "Hot", emoji: "🔥", color: "#e5484d" },
  { id: "warm", label: "Warm", emoji: "🌤️", color: "#e0972e" },
  { id: "cold", label: "Cold", emoji: "❄️", color: "#3b5bdb" },
] as const;
export type LeadTemperatureId = (typeof LEAD_TEMPERATURES)[number]["id"];
export function leadTemperatureConfig(id: string | null | undefined) {
  return LEAD_TEMPERATURES.find((t) => t.id === id) ?? null;
}

export var CAMPAIGN_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
] as const;
