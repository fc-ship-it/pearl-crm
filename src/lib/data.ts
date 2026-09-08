import { db, id as newId } from "@/lib/db";
import { urgencyScore, BILLING_PLANS, BILLING_GRACE_DAYS, type BillingIntervalId } from "@/lib/domain";

export type Deal = {
  id: string;
  orgId: string;
  contactId: string | null;
  companyId: string | null;
  title: string;
  value: number;
  stage: string;
  probability: number;
  ownerId: string | null;
  expectedCloseDate: string | null;
  lastInteractionAt: string;
  createdAt: string;
  contactName?: string;
  companyName?: string;
};

export type Contact = {
  id: string;
  orgId: string;
  companyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  interest: string | null;
  budgetTier: string | null;
  targetSegment: string | null;
  source: string;
  ownerId: string | null;
  createdAt: string;
  companyName?: string;
  dealCount?: number;
  dealValue?: number;
  lastInteractionAt?: string | null;
  temperature: "hot" | "warm" | "cold" | null;
};

export const LEAD_TEMPERATURES = ["hot", "warm", "cold"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export type ContactFilters = {
  interest?: string;
  budgetTier?: string;
  targetSegment?: string;
};

export type Campaign = {
  id: string;
  orgId: string;
  title: string;
  message: string;
  channel: string;
  segmentInterest: string | null;
  segmentBudgetTier: string | null;
  segmentTargetSegment: string | null;
  status: "draft" | "sent";
  recipientCount: number;
  createdAt: string;
  sentAt: string | null;
};

export const ALERT_KINDS = ["general", "call", "appointment"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export type CustomAlert = {
  id: string;
  orgId: string;
  title: string;
  remindAt: string;
  done: boolean;
  createdAt: string;
  kind: AlertKind;
  contactId: string | null;
  contactName?: string | null;
};

export type Activity = {
  id: string;
  orgId: string;
  contactId: string | null;
  dealId: string | null;
  type: string;
  content: string;
  occurredAt: string;
  createdAt: string;
};

export type TaskRow = {
  id: string;
  orgId: string;
  contactId: string | null;
  dealId: string | null;
  title: string;
  dueDate: string | null;
  done: boolean;
  priority: string;
  ownerId: string | null;
  createdAt: string;
  contactName?: string;
  dealTitle?: string;
};

export type Meeting = {
  id: string;
  orgId: string;
  contactId: string | null;
  dealId: string | null;
  title: string;
  date: string;
  transcript: string | null;
  summary: MeetingSummary | null;
  createdAt: string;
  contactName?: string;
};

export type MeetingSummary = {
  participants: string[];
  keyPoints: string[];
  decisions: string[];
  objections: string[];
  nextSteps: { action: string; owner: string; dueDate: string }[];
};

function toDeal(r: any): Deal {
  return {
    id: r.id,
    orgId: r.org_id,
    contactId: r.contact_id,
    companyId: r.company_id,
    title: r.title,
    value: r.value,
    stage: r.stage,
    probability: r.probability,
    ownerId: r.owner_id,
    expectedCloseDate: r.expected_close_date,
    lastInteractionAt: r.last_interaction_at,
    createdAt: r.created_at,
    contactName: r.contact_name ?? undefined,
    companyName: r.company_name ?? undefined,
  };
}

export function listDeals(orgId: string): Deal[] {
  const rows = db
    .prepare(
      `SELECT d.*, c.name as contact_name, co.name as company_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE d.org_id = ?
       ORDER BY d.created_at DESC`
    )
    .all(orgId);
  return rows.map(toDeal);
}

export function getDeal(orgId: string, dealId: string): Deal | null {
  const r = db
    .prepare(
      `SELECT d.*, c.name as contact_name, co.name as company_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE d.org_id = ? AND d.id = ?`
    )
    .get(orgId, dealId);
  return r ? toDeal(r) : null;
}

export function updateDealStage(orgId: string, dealId: string, stage: string) {
  db.prepare("UPDATE deals SET stage = ?, last_interaction_at = ? WHERE org_id = ? AND id = ?").run(
    stage,
    new Date().toISOString(),
    orgId,
    dealId
  );
}

function toContact(r: any): Contact {
  return {
    id: r.id,
    orgId: r.org_id,
    companyId: r.company_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    tags: JSON.parse(r.tags || "[]"),
    interest: r.interest ?? null,
    budgetTier: r.budget_tier ?? null,
    targetSegment: r.target_segment ?? null,
    source: r.source || "manual",
    ownerId: r.owner_id,
    createdAt: r.created_at,
    companyName: r.company_name ?? undefined,
    dealCount: r.deal_count ?? undefined,
    dealValue: r.deal_value ?? undefined,
    lastInteractionAt: r.last_interaction_at ?? null,
    temperature: (r.temperature as Contact["temperature"]) ?? null,
  };
}

export function setContactTemperature(orgId: string, contactId: string, temperature: LeadTemperature | null) {
  db.prepare("UPDATE contacts SET temperature = ? WHERE org_id = ? AND id = ?").run(temperature, orgId, contactId);
}

export function listContacts(orgId: string, filters: ContactFilters = {}): Contact[] {
  const clauses = ["ct.org_id = ?"];
  const params: any[] = [orgId];
  if (filters.interest) {
    clauses.push("ct.interest LIKE ?");
    params.push(`%${filters.interest}%`);
  }
  if (filters.budgetTier) {
    clauses.push("ct.budget_tier = ?");
    params.push(filters.budgetTier);
  }
  if (filters.targetSegment) {
    clauses.push("ct.target_segment = ?");
    params.push(filters.targetSegment);
  }
  const rows = db
    .prepare(
      `SELECT ct.*, co.name as company_name,
              (SELECT COUNT(*) FROM deals d WHERE d.contact_id = ct.id) as deal_count,
              (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.contact_id = ct.id) as deal_value,
              (SELECT MAX(last_interaction_at) FROM deals d WHERE d.contact_id = ct.id) as last_interaction_at
       FROM contacts ct
       LEFT JOIN companies co ON co.id = ct.company_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY ct.created_at DESC`
    )
    .all(...params);
  return rows.map(toContact);
}

export function getContact(orgId: string, contactId: string): Contact | null {
  const r = db
    .prepare(
      `SELECT ct.*, co.name as company_name
       FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
       WHERE ct.org_id = ? AND ct.id = ?`
    )
    .get(orgId, contactId);
  return r ? toContact(r) : null;
}

/** Finds a company by exact (case-insensitive) name, or creates one — used for both manual entry and vCard/QR imports that carry an organization name. */
export function getOrCreateCompany(orgId: string, name: string | null | undefined): string | null {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const existing = db
    .prepare("SELECT id FROM companies WHERE org_id = ? AND LOWER(name) = LOWER(?)")
    .get(orgId, trimmed) as { id: string } | undefined;
  if (existing) return existing.id;
  const cid = newId();
  db.prepare("INSERT INTO companies (id, org_id, name, sector, website, created_at) VALUES (?,?,?,?,?,?)").run(
    cid,
    orgId,
    trimmed,
    null,
    null,
    new Date().toISOString()
  );
  return cid;
}

export type NewContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  interest?: string | null;
  budgetTier?: string | null;
  targetSegment?: string | null;
  source?: string;
  ownerId?: string | null;
};

export function createContact(orgId: string, input: NewContactInput): Contact {
  const cid = newId();
  const companyId = getOrCreateCompany(orgId, input.companyName);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    cid,
    orgId,
    companyId,
    input.name.trim(),
    input.email?.trim() || null,
    input.phone?.trim() || null,
    "[]",
    input.interest?.trim() || null,
    input.budgetTier || null,
    input.targetSegment?.trim() || null,
    input.source || "manual",
    input.ownerId || null,
    createdAt
  );
  return getContact(orgId, cid)!;
}

/** Bulk-imports contacts (from a parsed .vcf file); duplicates by exact phone or email are skipped. */
export function importContacts(orgId: string, contacts: NewContactInput[]): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;
  for (const c of contacts) {
    if (!c.name?.trim()) {
      skipped++;
      continue;
    }
    if (c.phone || c.email) {
      const dup = db
        .prepare(
          `SELECT id FROM contacts WHERE org_id = ? AND ((phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?))`
        )
        .get(orgId, c.phone || "\0", c.email || "\0") as { id: string } | undefined;
      if (dup) {
        skipped++;
        continue;
      }
    }
    createContact(orgId, { ...c, source: c.source || "import" });
    imported++;
  }
  return { imported, skipped };
}

export function listActivitiesForContact(orgId: string, contactId: string): Activity[] {
  const rows = db
    .prepare(
      `SELECT * FROM activities WHERE org_id = ? AND contact_id = ? ORDER BY occurred_at DESC`
    )
    .all(orgId, contactId);
  return rows.map((r: any) => ({
    id: r.id,
    orgId: r.org_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    type: r.type,
    content: r.content,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  }));
}

export function listDealsForContact(orgId: string, contactId: string): Deal[] {
  const rows = db
    .prepare(`SELECT * FROM deals WHERE org_id = ? AND contact_id = ? ORDER BY created_at DESC`)
    .all(orgId, contactId);
  return rows.map(toDeal);
}

function toTask(r: any): TaskRow {
  return {
    id: r.id,
    orgId: r.org_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    title: r.title,
    dueDate: r.due_date,
    done: !!r.done,
    priority: r.priority,
    ownerId: r.owner_id,
    createdAt: r.created_at,
    contactName: r.contact_name ?? undefined,
    dealTitle: r.deal_title ?? undefined,
  };
}

export function listTasks(orgId: string, opts: { onlyOpen?: boolean } = {}): TaskRow[] {
  const rows = db
    .prepare(
      `SELECT t.*, c.name as contact_name, d.title as deal_title
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       LEFT JOIN deals d ON d.id = t.deal_id
       WHERE t.org_id = ? ${opts.onlyOpen ? "AND t.done = 0" : ""}
       ORDER BY t.due_date ASC`
    )
    .all(orgId);
  return rows.map(toTask);
}

export function toggleTask(orgId: string, taskId: string, done: boolean) {
  db.prepare("UPDATE tasks SET done = ? WHERE org_id = ? AND id = ?").run(done ? 1 : 0, orgId, taskId);
}

function toMeeting(r: any): Meeting {
  return {
    id: r.id,
    orgId: r.org_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    title: r.title,
    date: r.date,
    transcript: r.transcript,
    summary: r.summary_json ? JSON.parse(r.summary_json) : null,
    createdAt: r.created_at,
    contactName: r.contact_name ?? undefined,
  };
}

export function listMeetings(orgId: string): Meeting[] {
  const rows = db
    .prepare(
      `SELECT m.*, c.name as contact_name FROM meetings m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.org_id = ? ORDER BY m.date DESC`
    )
    .all(orgId);
  return rows.map(toMeeting);
}

export function getMeeting(orgId: string, meetingId: string): Meeting | null {
  const r = db
    .prepare(
      `SELECT m.*, c.name as contact_name FROM meetings m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.org_id = ? AND m.id = ?`
    )
    .get(orgId, meetingId);
  return r ? toMeeting(r) : null;
}

export function listCompanies(orgId: string) {
  return db.prepare("SELECT * FROM companies WHERE org_id = ? ORDER BY name ASC").all(orgId) as {
    id: string;
    name: string;
    sector: string | null;
    website: string | null;
  }[];
}

export function listIntegrations(orgId: string) {
  return db.prepare("SELECT * FROM integrations WHERE org_id = ?").all(orgId) as {
    id: string;
    provider: string;
    connected: number;
    connected_at: string | null;
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: string | null;
    extra: string | null;
  }[];
}

export function getIntegration(orgId: string, provider: string) {
  return db.prepare("SELECT * FROM integrations WHERE org_id = ? AND provider = ?").get(orgId, provider) as
    | {
        id: string;
        provider: string;
        connected: number;
        connected_at: string | null;
        access_token: string | null;
        refresh_token: string | null;
        token_expiry: string | null;
        extra: string | null;
      }
    | undefined;
}

export function setIntegration(orgId: string, provider: string, connected: boolean) {
  const existing = db
    .prepare("SELECT id FROM integrations WHERE org_id = ? AND provider = ?")
    .get(orgId, provider) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE integrations SET connected = ?, connected_at = ?, access_token = NULL, refresh_token = NULL, token_expiry = NULL, extra = NULL WHERE id = ?"
    ).run(connected ? 1 : 0, connected ? new Date().toISOString() : null, existing.id);
  } else if (connected) {
    db.prepare(
      "INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,1,?)"
    ).run(newId(), orgId, provider, new Date().toISOString());
  }
}

/** Stores real OAuth/API credentials for a provider and marks it connected. */
export function saveIntegrationCredentials(
  orgId: string,
  provider: string,
  creds: { accessToken?: string; refreshToken?: string; tokenExpiry?: string; extra?: Record<string, unknown> }
) {
  const existing = db
    .prepare("SELECT id FROM integrations WHERE org_id = ? AND provider = ?")
    .get(orgId, provider) as { id: string } | undefined;
  const extraJson = creds.extra ? JSON.stringify(creds.extra) : null;
  if (existing) {
    db.prepare(
      "UPDATE integrations SET connected = 1, connected_at = ?, access_token = COALESCE(?, access_token), refresh_token = COALESCE(?, refresh_token), token_expiry = ?, extra = COALESCE(?, extra) WHERE id = ?"
    ).run(new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson, existing.id);
  } else {
    db.prepare(
      "INSERT INTO integrations (id, org_id, provider, connected, connected_at, access_token, refresh_token, token_expiry, extra) VALUES (?,?,?,1,?,?,?,?,?)"
    ).run(newId(), orgId, provider, new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson);
  }
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended";

export type Organization = {
  id: string;
  name: string;
  plan: string;
  trial_ends_at: string;
  promo_bonus_days: number;
  created_at: string;
  billing_interval: BillingIntervalId | null;
  billing_period_end: string | null;
  subscription_status: SubscriptionStatus;
  grace_until: string | null;
  pending_payment_intent_id: string | null;
  pending_interval: BillingIntervalId | null;
  last_applied_payment_intent_id: string | null;
};

export function getOrganization(orgId: string): Organization | undefined {
  return db.prepare("SELECT * FROM organizations WHERE id = ?").get(orgId) as Organization | undefined;
}

/** Who a billing email for this org should go to — the earliest-created
 * ADMIN account (normally the person who signed up), falling back to
 * whichever user exists first if an org somehow has no ADMIN. */
export function getOrgBillingContactEmail(orgId: string): string | null {
  const row = db
    .prepare(
      `SELECT email FROM users WHERE org_id = ?
       ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`
    )
    .get(orgId) as { email: string } | undefined;
  return row?.email ?? null;
}

/** Whether the org's trial has run out and no paid period covers it — i.e.
 * whether /app/* should redirect to the renewal screen. A `past_due` org
 * (period over, still inside its grace window) keeps full access; only
 * `suspended` blocks it. Trial itself is never blocked here — that only
 * starts once `subscription_status` actually flips to `suspended` by the
 * scheduled renewal check (see checkBillingRenewals). */
export function isAccessBlocked(org: Organization): boolean {
  return org.subscription_status === "suspended";
}

/** Kicks off a renewal/upgrade: remembers which Ziina payment intent is in
 * flight for which interval, so the success-page check and the webhook can
 * both recognize it (and so a second, unrelated payment intent for the same
 * org can't be mistaken for this one). */
export function setPendingPaymentIntent(orgId: string, paymentIntentId: string, interval: BillingIntervalId) {
  db.prepare("UPDATE organizations SET pending_payment_intent_id = ?, pending_interval = ? WHERE id = ?").run(
    paymentIntentId,
    interval,
    orgId
  );
}

/** Applies a completed Ziina payment: extends the paid period by the plan's
 * length (stacking onto whatever's left of the current period, so renewing
 * a few days early doesn't lose those days), marks the org active, and
 * clears the grace deadline. Idempotent on `paymentIntentId` — both the
 * webhook and the success-page check call this for the same payment, and
 * only the first one should actually extend anything. Returns false if this
 * payment was already applied or the org/intent don't match. */
export function applyCompletedPayment(orgId: string, paymentIntentId: string): boolean {
  const org = getOrganization(orgId);
  if (!org) return false;
  if (org.last_applied_payment_intent_id === paymentIntentId) return false;
  if (org.pending_payment_intent_id !== paymentIntentId) return false;

  const interval = org.pending_interval;
  const plan = BILLING_PLANS.find((p) => p.id === interval);
  if (!plan) return false;

  const currentEnd = org.billing_period_end ? new Date(org.billing_period_end).getTime() : 0;
  const base = currentEnd > Date.now() ? currentEnd : Date.now();
  const newEnd = new Date(base + plan.days * 24 * 3600 * 1000).toISOString();

  db.prepare(
    `UPDATE organizations
     SET plan = ?, billing_interval = ?, billing_period_end = ?, subscription_status = 'active',
         grace_until = NULL, pending_payment_intent_id = NULL, pending_interval = NULL,
         last_applied_payment_intent_id = ?
     WHERE id = ?`
  ).run(interval, interval, newEnd, paymentIntentId, orgId);
  return true;
}

/** Orgs whose paid period has ended: first pass moves them into their grace
 * window and (by returning them here) triggers a fresh renewal email; a
 * later pass — once `grace_until` itself is past — suspends access. Used by
 * the daily /api/billing/cron check. */
export function listOrgsToMoveToGrace(): Organization[] {
  const rows = db
    .prepare(
      `SELECT * FROM organizations
       WHERE subscription_status = 'active' AND billing_period_end IS NOT NULL AND billing_period_end < ?`
    )
    .all(new Date().toISOString());
  return rows as Organization[];
}

export function moveOrgToGrace(orgId: string) {
  const graceUntil = new Date(Date.now() + BILLING_GRACE_DAYS * 24 * 3600 * 1000).toISOString();
  db.prepare("UPDATE organizations SET subscription_status = 'past_due', grace_until = ? WHERE id = ?").run(graceUntil, orgId);
}

export function listOrgsToSuspend(): Organization[] {
  const rows = db
    .prepare(`SELECT * FROM organizations WHERE subscription_status = 'past_due' AND grace_until IS NOT NULL AND grace_until < ?`)
    .all(new Date().toISOString());
  return rows as Organization[];
}

export function suspendOrg(orgId: string) {
  db.prepare("UPDATE organizations SET subscription_status = 'suspended' WHERE id = ?").run(orgId);
}

/** Looks up which org a Ziina webhook event belongs to, by the payment
 * intent id it carries — webhooks don't know our internal org ids, only
 * Ziina's own payment_intent id, which we stashed on the org row when the
 * checkout started (see setPendingPaymentIntent). */
export function findOrgByPendingPaymentIntent(paymentIntentId: string): Organization | undefined {
  return db.prepare("SELECT * FROM organizations WHERE pending_payment_intent_id = ?").get(paymentIntentId) as
    | Organization
    | undefined;
}

/** Alerts: open deals gone quiet, sorted by urgency desc. */
export function listAlerts(orgId: string) {
  const deals = listDeals(orgId).filter((d) => !d.stage.startsWith("closed"));
  return deals
    .map((d) => ({ deal: d, score: urgencyScore(d) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function toCampaign(r: any): Campaign {
  return {
    id: r.id,
    orgId: r.org_id,
    title: r.title,
    message: r.message,
    channel: r.channel,
    segmentInterest: r.segment_interest,
    segmentBudgetTier: r.segment_budget_tier,
    segmentTargetSegment: r.segment_target_segment,
    status: r.status,
    recipientCount: r.recipient_count,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

export function listCampaigns(orgId: string): Campaign[] {
  const rows = db.prepare("SELECT * FROM campaigns WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
  return rows.map(toCampaign);
}

export function getCampaign(orgId: string, campaignId: string): Campaign | null {
  const r = db.prepare("SELECT * FROM campaigns WHERE org_id = ? AND id = ?").get(orgId, campaignId);
  return r ? toCampaign(r) : null;
}

export type CampaignSegment = { interest?: string; budgetTier?: string; targetSegment?: string };

/** Contacts matching a campaign's targeting filters — used both for the live "N recipients" preview and at send time. */
export function audienceForSegment(orgId: string, segment: CampaignSegment): Contact[] {
  return listContacts(orgId, {
    interest: segment.interest || undefined,
    budgetTier: segment.budgetTier || undefined,
    targetSegment: segment.targetSegment || undefined,
  });
}

export function createCampaign(
  orgId: string,
  input: { title: string; message: string; channel: string; segment: CampaignSegment }
): Campaign {
  const cid = newId();
  db.prepare(
    `INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    cid,
    orgId,
    input.title.trim(),
    input.message.trim(),
    input.channel,
    input.segment.interest || null,
    input.segment.budgetTier || null,
    input.segment.targetSegment || null,
    "draft",
    0,
    new Date().toISOString(),
    null
  );
  return getCampaign(orgId, cid)!;
}

/**
 * Simulated send — matches the same pattern as the Gmail/WhatsApp/Calendar
 * integrations elsewhere in this MVP: no real message goes out, but the
 * audience match, recipient count and per-contact activity log are all real,
 * so the workflow is genuinely demoable end to end.
 */
export function sendCampaign(orgId: string, campaignId: string): Campaign | null {
  const campaign = getCampaign(orgId, campaignId);
  if (!campaign) return null;
  const audience = audienceForSegment(orgId, {
    interest: campaign.segmentInterest || undefined,
    budgetTier: campaign.segmentBudgetTier || undefined,
    targetSegment: campaign.segmentTargetSegment || undefined,
  });
  const sentAt = new Date().toISOString();
  db.prepare("UPDATE campaigns SET status = 'sent', recipient_count = ?, sent_at = ? WHERE id = ? AND org_id = ?").run(
    audience.length,
    sentAt,
    campaignId,
    orgId
  );
  for (const contact of audience) {
    db.prepare(
      "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(newId(), orgId, contact.id, null, campaign.channel, `Campaign sent: ${campaign.title}`, sentAt, sentAt);
  }
  return getCampaign(orgId, campaignId);
}

function toCustomAlert(r: any): CustomAlert {
  return {
    id: r.id,
    orgId: r.org_id,
    title: r.title,
    remindAt: r.remind_at,
    done: !!r.done,
    createdAt: r.created_at,
    kind: (r.kind as AlertKind) || "general",
    contactId: r.contact_id ?? null,
    contactName: r.contact_name ?? null,
  };
}

export function listCustomAlerts(orgId: string, opts: { onlyOpen?: boolean } = {}): CustomAlert[] {
  const rows = db
    .prepare(
      `SELECT ca.*, c.name as contact_name
       FROM custom_alerts ca LEFT JOIN contacts c ON c.id = ca.contact_id
       WHERE ca.org_id = ? ${opts.onlyOpen ? "AND ca.done = 0" : ""}
       ORDER BY ca.remind_at ASC`
    )
    .all(orgId);
  return rows.map(toCustomAlert);
}

export function createCustomAlert(
  orgId: string,
  title: string,
  remindAt: string,
  kind: AlertKind = "general",
  contactId: string | null = null
): CustomAlert {
  const aid = newId();
  db.prepare(
    "INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at, kind, contact_id) VALUES (?,?,?,?,?,?,?,?)"
  ).run(aid, orgId, title.trim(), remindAt, 0, new Date().toISOString(), kind, contactId);
  return listCustomAlerts(orgId).find((a) => a.id === aid)!;
}

export function toggleCustomAlert(orgId: string, alertId: string, done: boolean) {
  db.prepare("UPDATE custom_alerts SET done = ? WHERE org_id = ? AND id = ?").run(done ? 1 : 0, orgId, alertId);
}

// ---- Owner (AHEAD LLC) — cross-tenant views -----------------------------
// Everything below is platform-level: it deliberately ignores org_id
// scoping because it's for Federica/AHEAD LLC to see every business that
// signs up for Pearl, not for a tenant to see other tenants' data. Only
// reachable from src/app/owner/* (gated by the separate owner session).

export type OrgSummary = {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: string;
  promoBonusDays: number;
  createdAt: string;
  userCount: number;
  contactCount: number;
  dealCount: number;
};

export function listAllOrganizations(): OrgSummary[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.name, o.plan, o.trial_ends_at, o.promo_bonus_days, o.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
              (SELECT COUNT(*) FROM contacts c WHERE c.org_id = o.id) AS contact_count,
              (SELECT COUNT(*) FROM deals d WHERE d.org_id = o.id) AS deal_count
       FROM organizations o
       ORDER BY o.created_at DESC`
    )
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    plan: r.plan,
    trialEndsAt: r.trial_ends_at,
    promoBonusDays: r.promo_bonus_days,
    createdAt: r.created_at,
    userCount: r.user_count,
    contactCount: r.contact_count,
    dealCount: r.deal_count,
  }));
}

export type PlatformUser = {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export function listAllUsers(): PlatformUser[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.org_id, o.name AS org_name, u.name, u.email, u.role, u.created_at
       FROM users u JOIN organizations o ON o.id = u.org_id
       ORDER BY u.created_at DESC`
    )
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org_name,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export type PlatformContact = {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  interest: string | null;
  budgetTier: string | null;
  targetSegment: string | null;
  temperature: string | null;
  source: string;
  createdAt: string;
};

/** Every contact across every client organization — platform-owner-only, used for the Owner Dashboard's Excel export. */
export function listAllContacts(): PlatformContact[] {
  const rows = db
    .prepare(
      `SELECT ct.id, ct.org_id, o.name AS org_name, ct.name, ct.email, ct.phone,
              co.name AS company_name, ct.interest, ct.budget_tier, ct.target_segment,
              ct.temperature, ct.source, ct.created_at
       FROM contacts ct
       JOIN organizations o ON o.id = ct.org_id
       LEFT JOIN companies co ON co.id = ct.company_id
       ORDER BY o.name ASC, ct.created_at DESC`
    )
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org_name,
    name: r.name,
    email: r.email,
    phone: r.phone,
    companyName: r.company_name,
    interest: r.interest,
    budgetTier: r.budget_tier,
    targetSegment: r.target_segment,
    temperature: r.temperature,
    source: r.source,
    createdAt: r.created_at,
  }));
}

export function platformStats() {
  const orgs = listAllOrganizations();
  const now = Date.now();
  return {
    totalOrgs: orgs.length,
    totalUsers: orgs.reduce((s, o) => s + o.userCount, 0),
    totalContacts: orgs.reduce((s, o) => s + o.contactCount, 0),
    activeTrials: orgs.filter((o) => o.plan === "trial" && new Date(o.trialEndsAt).getTime() > now).length,
    expiredTrials: orgs.filter((o) => o.plan === "trial" && new Date(o.trialEndsAt).getTime() <= now).length,
  };
}

export function extendTrial(orgId: string, days: number) {
  const org = getOrganization(orgId);
  if (!org) return;
  const base = Math.max(new Date(org.trial_ends_at).getTime(), Date.now());
  const newEnd = new Date(base + days * 24 * 3600 * 1000).toISOString();
  db.prepare("UPDATE organizations SET trial_ends_at = ?, promo_bonus_days = promo_bonus_days + ? WHERE id = ?").run(
    newEnd,
    days,
    orgId
  );
}

/** Owner Dashboard manual override — for a customer who paid outside Ziina
 * (bank transfer, cash, a Ziina P2P transfer straight to AHEAD LLC's
 * account) rather than through the in-app checkout. Same effect as a
 * completed Ziina payment: activates the plan and extends the period,
 * stacking onto whatever's left of the current one. */
export function grantManualPlan(orgId: string, interval: BillingIntervalId) {
  const plan = BILLING_PLANS.find((p) => p.id === interval);
  if (!plan) return;
  const org = getOrganization(orgId);
  if (!org) return;
  const currentEnd = org.billing_period_end ? new Date(org.billing_period_end).getTime() : 0;
  const base = currentEnd > Date.now() ? currentEnd : Date.now();
  const newEnd = new Date(base + plan.days * 24 * 3600 * 1000).toISOString();
  db.prepare(
    `UPDATE organizations SET plan = ?, billing_interval = ?, billing_period_end = ?, subscription_status = 'active', grace_until = NULL WHERE id = ?`
  ).run(interval, interval, newEnd, orgId);
}

export function dashboardStats(orgId: string) {
  const deals = listDeals(orgId);
  const open = deals.filter((d) => !d.stage.startsWith("closed"));
  const won = deals.filter((d) => d.stage === "closed_won");
  const lost = deals.filter((d) => d.stage === "closed_lost");
  const pipelineValue = open.reduce((s, d) => s + d.value, 0);
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const conversionRate = deals.length > 0 ? Math.round((won.length / (won.length + lost.length || 1)) * 100) : 0;
  const dueCustomAlerts = listCustomAlerts(orgId, { onlyOpen: true }).filter((a) => new Date(a.remindAt).getTime() <= Date.now());
  return {
    pipelineValue,
    wonValue,
    openCount: open.length,
    wonCount: won.length,
    conversionRate,
    dealsAtRisk: listAlerts(orgId).slice(0, 5),
    dueCustomAlerts,
  };
}
