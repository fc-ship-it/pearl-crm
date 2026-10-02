// Shared domain constants and pure functions (stage config, urgency scoring,
// formatting). Kept framework-free so they're trivial to unit test later.

/** One product, three billing cadences (see /app/settings/billing) — the
 * canonical prices and period lengths live here so the pricing page and the
 * Stripe checkout/webhook code can't drift apart. `stripeInterval` is the
 * recurring interval passed straight to Stripe's Checkout Session
 * (`price_data.recurring.interval`) — see src/lib/stripe.ts.
 *
 * `amountEur` is a straight AED→EUR conversion (today's approximate rate,
 * rounded) for selling into the Italian/EU market — Dubai stays the billing
 * entity and settlement currency either way; this only changes what the
 * customer sees and is charged in Stripe Checkout (see CurrencyId below).
 * `amountAed` is kept as the only field the pre-existing Ziina/legacy billing
 * code (owner dashboard manual grants, the old cron sweep) reads, so none of
 * that needs to change. */
export const BILLING_PLANS = [
  { id: "weekly", label: "Weekly", amountAed: 24, amountEur: 6, days: 7, period: "/week", stripeInterval: "week", note: "Auto-renews every week — cancel any time.", highlighted: false },
  { id: "monthly", label: "Monthly", amountAed: 80, amountEur: 20, days: 30, period: "/month", stripeInterval: "month", note: "Auto-renews every month — cancel any time.", highlighted: true },
  { id: "annual", label: "Annual", amountAed: 800, amountEur: 200, days: 365, period: "/year", stripeInterval: "year", note: "2 months free vs. paying monthly. Auto-renews yearly.", highlighted: false },
] as const;
export type BillingIntervalId = (typeof BILLING_PLANS)[number]["id"];
export function billingPlanConfig(id: string | null | undefined) {
  return BILLING_PLANS.find((p) => p.id === id) ?? null;
}

/** The two currencies a customer can be shown/charged in — AED (UAE, the
 * default) or EUR (Italy/EU market). Everything settles through the same
 * Dubai Stripe account regardless; this only picks presentment currency. */
export type CurrencyId = "AED" | "EUR";
export const DEFAULT_CURRENCY: CurrencyId = "AED";
export function billingPlanAmount(plan: (typeof BILLING_PLANS)[number], currency: CurrencyId): number {
  return currency === "EUR" ? plan.amountEur : plan.amountAed;
}
export function formatBillingAmount(amount: number, currency: CurrencyId): string {
  return currency === "EUR" ? `€${amount}` : `AED ${amount}`;
}
/** The annual plan's "2 months free" framing needs the monthly-equivalent
 * yearly cost, which depends on which currency is being shown — computed
 * here (from the monthly plan) rather than baked into a static string. */
export function annualYearlyEquivalentLabel(currency: CurrencyId): string {
  const monthly = BILLING_PLANS.find((p) => p.id === "monthly")!;
  return formatBillingAmount(billingPlanAmount(monthly, currency) * 12, currency);
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
 * "Plan my week" proximity proxy — there's no paid geocoding/routing API
 * wired up, so instead of true distance this groups contacts by the last
 * comma-separated segment of their stored address (typically the city/area,
 * e.g. "Sheikh Zayed Rd, Dubai" -> "Dubai"). It's an approximation, not real
 * geographic distance, but it's free and it's usually right: people who
 * share a city genuinely are closer to visit back-to-back than people who
 * don't. Returns null when there's no address to work with at all.
 */
export function addressArea(address: string | null | undefined): string | null {
  const trimmed = (address || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  const area = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return area || null;
}

/** Link to open a free-text address in Google Maps — no API key, no
 * geocoding, just a search query URL. Works for any address string. */
export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The next `count` weekdays (Mon-Fri, weekends skipped), starting tomorrow —
 * used to label "Plan my week"'s five day-slots with real dates rather than
 * bare weekday names. Each slot defaults to 9am so a scheduled visit has a
 * sensible time even before the person picks one. No `Intl`, for the same
 * SSR/hydration-consistency reason as {@link formatDate}.
 */
export function upcomingWeekdays(count = 5): { iso: string; dayName: string; dateLabel: string }[] {
  const out: { iso: string; dayName: string; dateLabel: string }[] = [];
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      out.push({ iso: d.toISOString(), dayName: DAY_NAMES[day], dateLabel: formatDate(d.toISOString()) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

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

/** Number of days since a contact's last interaction, falling back to when
 * it was created if it has none yet (no deal ever logged against it) — a
 * contact that's never had a single interaction is exactly the kind that
 * needs a follow-up nudge, not one the "stale" check should skip. */
export function daysSinceLastContact(contact: { lastInteractionAt?: string | null; createdAt: string }): number {
  return daysSince(contact.lastInteractionAt || contact.createdAt);
}

/** Thresholds for the "needs follow-up" nudge on the Contacts list — picked
 * to read as "getting cold" vs. "gone cold", not tied to any one sales
 * cadence. */
export const FOLLOW_UP_STALE_DAYS = 30;
export const FOLLOW_UP_VERY_STALE_DAYS = 90;

export type FollowUpUrgency = "fresh" | "stale" | "very_stale";

export function followUpUrgency(days: number): FollowUpUrgency {
  if (days >= FOLLOW_UP_VERY_STALE_DAYS) return "very_stale";
  if (days >= FOLLOW_UP_STALE_DAYS) return "stale";
  return "fresh";
}

/** Lower-cased, trimmed — the baseline every email comparison in the app
 * (duplicate detection, import de-duping, the Google/Outlook-style
 * "is this the same person" check) should use instead of a raw exact-string
 * match, which treats "Mario@x.com" and "mario@x.com" as different people. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

/** Strips formatting (spaces, dashes, dots, parentheses) so "+39 333 123
 * 4567", "0039-333-1234567" and "3331234567" all compare on equal footing
 * where they reasonably can — deliberately NOT stripping a leading "0"
 * beyond the "00" international prefix, since Italian landline numbers keep
 * their leading 0 even in full international form (unlike most countries),
 * so guessing at it would create false matches more often than it'd catch
 * real ones. This is a practical normalizer for duplicate-spotting, not a
 * full E.164 parser. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("00") ? "+" + digits.slice(2) : digits;
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

/**
 * Common target-segment suggestions shown as datalist options; free text is
 * also accepted, so this is just a head start, never a closed list. Pearl is
 * sold to different kinds of businesses, so this keeps the generic B2B
 * verticals (useful to most customers) and adds the ones a consultant
 * running several practice lines at once — e.g. safety/RSPP, real estate,
 * health & wellness — actually needs day to day.
 */
export const TARGET_SEGMENT_SUGGESTIONS = [
  "Hospitality",
  "Manufacturing",
  "Retail",
  "Industrial",
  "Venture / Tech",
  "Government",
  "SMB",
  "Enterprise",
  "Sicurezza / RSPP",
  "Real Estate",
  "Salute e benessere",
  "Consulenza aziendale",
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

/** Every card on the Statistics page, in default order. "kind" decides which
 * grid it renders in (stat cards in the 4-up row, charts in the 2-up rows)
 * — the customize panel lets the user toggle/reorder within each kind, kept
 * separate rather than one fully free-form grid so the layout never breaks. */
export const STATISTICS_WIDGETS = [
  { id: "open_pipeline_value", labelKey: "statistics.stat.openPipeline", kind: "stat" },
  { id: "closed_won_value", labelKey: "statistics.stat.closedWon", kind: "stat" },
  { id: "total_contacts", labelKey: "statistics.stat.totalContacts", kind: "stat" },
  { id: "hot_leads", labelKey: "statistics.stat.hotLeads", kind: "stat" },
  { id: "pipeline_by_stage", labelKey: "statistics.pipelineByStage", kind: "chart" },
  { id: "lead_temperature", labelKey: "statistics.leadTemperature", kind: "chart" },
  { id: "contacts_by_source", labelKey: "statistics.contactsBySource", kind: "chart" },
  { id: "contacts_trend", labelKey: "statistics.newContactsTrend", kind: "chart" },
] as const;
export type StatisticsWidgetId = (typeof STATISTICS_WIDGETS)[number]["id"];
export const DEFAULT_STATISTICS_WIDGET_IDS: StatisticsWidgetId[] = STATISTICS_WIDGETS.map((w) => w.id);

/** A user's saved list IS exactly which widgets show, in that order (like
 * customizing a phone's home screen — remove one and it stays removed until
 * you add it back from the customize panel). `null` means "never
 * customized" and falls back to every widget in its default order; an old
 * saved list is still filtered against the current registry so a widget
 * that was since removed from the app can't linger. */
export function resolveStatisticsWidgets(saved: string[] | null): StatisticsWidgetId[] {
  if (saved === null) return DEFAULT_STATISTICS_WIDGET_IDS;
  const known = new Set(DEFAULT_STATISTICS_WIDGET_IDS as string[]);
  return saved.filter((id): id is StatisticsWidgetId => known.has(id));
}

export var CAMPAIGN_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
] as const;

/** How a meeting happens — chosen when scheduling it. "detail" holds the
 * Zoom/Meet link for the two video options, or the physical address for
 * in-person; shown as a badge + link/address wherever the meeting appears. */
export const MEETING_LOCATION_TYPES = [
  { id: "zoom", label: "Zoom", icon: "video", detailLabel: "Zoom link", detailPlaceholder: "https://zoom.us/j/…" },
  { id: "google_meet", label: "Google Meet", icon: "video", detailLabel: "Meet link", detailPlaceholder: "https://meet.google.com/…" },
  { id: "in_person", label: "In person", icon: "map-pin", detailLabel: "Location / address", detailPlaceholder: "E.g. Client office, Sheikh Zayed Rd" },
] as const;
export type MeetingLocationTypeId = (typeof MEETING_LOCATION_TYPES)[number]["id"];
export function meetingLocationTypeConfig(id: string | null | undefined) {
  return MEETING_LOCATION_TYPES.find((t) => t.id === id) ?? null;
}
