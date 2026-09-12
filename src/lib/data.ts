import { db, id as newId } from "@/lib/db";
import { urgencyScore, BILLING_PLANS, BILLING_GRACE_DAYS, type BillingIntervalId } from "@/lib/domain";

// NOTE: every exported function here is `async` now. Under the old
// node:sqlite driver these were synchronous — but a real network database
// (Postgres) can't be queried synchronously, so every call site in the app
// now needs `await`. See src/lib/db.ts for why this move was necessary.

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
  /**
   * True → only contacts with no company, interest, budget tier, or target
   * segment set. That combination is what a raw phone-book import via the
   * Contact Picker looks like (it only ever carries name/email/phone), so
   * this is what lets someone reliably select "everything I imported from
   * my phone" without also catching demo/manually-entered contacts, which
   * always have at least one of those fields filled in.
   */
  rawImportsOnly?: boolean;
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

export async function listDeals(orgId: string): Promise<Deal[]> {
  const rows = await db
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

export async function getDeal(orgId: string, dealId: string): Promise<Deal | null> {
  const r = await db
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

export async function updateDealStage(orgId: string, dealId: string, stage: string): Promise<void> {
  await db.prepare("UPDATE deals SET stage = ?, last_interaction_at = ? WHERE org_id = ? AND id = ?").run(
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

export async function setContactTemperature(orgId: string, contactId: string, temperature: LeadTemperature | null): Promise<void> {
  await db.prepare("UPDATE contacts SET temperature = ? WHERE org_id = ? AND id = ?").run(temperature, orgId, contactId);
}

/**
 * Deletes a contact and everything that only makes sense attached to that
 * contact (its logged activities, its tasks, its meetings, its reminders).
 * Deals are kept but detached (contact_id set to null) rather than deleted,
 * since a deal is a financial record worth preserving even if the contact
 * behind it goes away. All of this has to happen before the DELETE on
 * `contacts` itself, since every one of those tables has a foreign key
 * pointing at it and Postgres (unlike the old SQLite driver) actually
 * enforces that at commit time.
 */
export async function deleteContact(orgId: string, contactId: string): Promise<void> {
  await db.prepare("DELETE FROM activities WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM tasks WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM meetings WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM custom_alerts WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("UPDATE deals SET contact_id = NULL WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM contacts WHERE org_id = ? AND id = ?").run(orgId, contactId);
}

/**
 * Bulk version of deleteContact — used by the "select many, delete" action
 * in the contacts list, e.g. wiping out a batch of thousands of contacts
 * imported by mistake (a phone's whole address book via the Contact
 * Picker). Same detach-then-delete order as the single-contact version,
 * just one statement per table instead of one per contact per table, which
 * matters once contactIds is in the thousands rather than a handful.
 */
export async function deleteContacts(orgId: string, contactIds: string[]): Promise<number> {
  if (contactIds.length === 0) return 0;
  await db.prepare("DELETE FROM activities WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM tasks WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM meetings WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM custom_alerts WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("UPDATE deals SET contact_id = NULL WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  const result = await db.prepare("DELETE FROM contacts WHERE org_id = ? AND id = ANY(?::text[])").run(orgId, contactIds);
  return result.changes;
}

export async function listContacts(orgId: string, filters: ContactFilters = {}): Promise<Contact[]> {
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
  if (filters.rawImportsOnly) {
    clauses.push("ct.company_id IS NULL AND ct.interest IS NULL AND ct.budget_tier IS NULL AND ct.target_segment IS NULL");
  }
  const rows = await db
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

export async function getContact(orgId: string, contactId: string): Promise<Contact | null> {
  const r = await db
    .prepare(
      `SELECT ct.*, co.name as company_name
       FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
       WHERE ct.org_id = ? AND ct.id = ?`
    )
    .get(orgId, contactId);
  return r ? toContact(r) : null;
}

/** Finds a company by exact (case-insensitive) name, or creates one — used for both manual entry and vCard/QR imports that carry an organization name. */
export async function getOrCreateCompany(orgId: string, name: string | null | undefined): Promise<string | null> {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const existing = (await db
    .prepare("SELECT id FROM companies WHERE org_id = ? AND LOWER(name) = LOWER(?)")
    .get(orgId, trimmed)) as { id: string } | undefined;
  if (existing) return existing.id;
  const cid = newId();
  await db.prepare("INSERT INTO companies (id, org_id, name, sector, website, created_at) VALUES (?,?,?,?,?,?)").run(
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

export async function createContact(orgId: string, input: NewContactInput): Promise<Contact> {
  const cid = newId();
  const companyId = await getOrCreateCompany(orgId, input.companyName);
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
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
  return (await getContact(orgId, cid))!;
}

/** Bulk-imports contacts (from a parsed .vcf file); duplicates by exact phone or email are skipped. */
export async function importContacts(orgId: string, contacts: NewContactInput[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const c of contacts) {
    if (!c.name?.trim()) {
      skipped++;
      continue;
    }
    if (c.phone || c.email) {
      const dup = (await db
        .prepare(
          `SELECT id FROM contacts WHERE org_id = ? AND ((phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?))`
        )
        .get(orgId, c.phone || null, c.email || null)) as { id: string } | undefined;
      if (dup) {
        skipped++;
        continue;
      }
    }
    await createContact(orgId, { ...c, source: c.source || "import" });
    imported++;
  }
  return { imported, skipped };
}

export async function listActivitiesForContact(orgId: string, contactId: string): Promise<Activity[]> {
  const rows = await db
    .prepare(`SELECT * FROM activities WHERE org_id = ? AND contact_id = ? ORDER BY occurred_at DESC`)
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

export async function listDealsForContact(orgId: string, contactId: string): Promise<Deal[]> {
  const rows = await db
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

export async function listTasks(orgId: string, opts: { onlyOpen?: boolean } = {}): Promise<TaskRow[]> {
  const rows = await db
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

export async function toggleTask(orgId: string, taskId: string, done: boolean): Promise<void> {
  await db.prepare("UPDATE tasks SET done = ? WHERE org_id = ? AND id = ?").run(done ? 1 : 0, orgId, taskId);
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

export async function listMeetings(orgId: string): Promise<Meeting[]> {
  const rows = await db
    .prepare(
      `SELECT m.*, c.name as contact_name FROM meetings m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.org_id = ? ORDER BY m.date DESC`
    )
    .all(orgId);
  return rows.map(toMeeting);
}

export async function getMeeting(orgId: string, meetingId: string): Promise<Meeting | null> {
  const r = await db
    .prepare(
      `SELECT m.*, c.name as contact_name FROM meetings m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.org_id = ? AND m.id = ?`
    )
    .get(orgId, meetingId);
  return r ? toMeeting(r) : null;
}

export async function listCompanies(orgId: string) {
  return (await db.prepare("SELECT * FROM companies WHERE org_id = ? ORDER BY name ASC").all(orgId)) as {
    id: string;
    name: string;
    sector: string | null;
    website: string | null;
  }[];
}

export async function listIntegrations(orgId: string) {
  return (await db.prepare("SELECT * FROM integrations WHERE org_id = ?").all(orgId)) as {
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

export async function getIntegration(orgId: string, provider: string) {
  return (await db.prepare("SELECT * FROM integrations WHERE org_id = ? AND provider = ?").get(orgId, provider)) as
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

export async function setIntegration(orgId: string, provider: string, connected: boolean): Promise<void> {
  const existing = (await db
    .prepare("SELECT id FROM integrations WHERE org_id = ? AND provider = ?")
    .get(orgId, provider)) as { id: string } | undefined;
  if (existing) {
    await db
      .prepare(
        "UPDATE integrations SET connected = ?, connected_at = ?, access_token = NULL, refresh_token = NULL, token_expiry = NULL, extra = NULL WHERE id = ?"
      )
      .run(connected ? 1 : 0, connected ? new Date().toISOString() : null, existing.id);
  } else if (connected) {
    await db
      .prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,1,?)")
      .run(newId(), orgId, provider, new Date().toISOString());
  }
}

/** Stores real OAuth/API credentials for a provider and marks it connected. */
export async function saveIntegrationCredentials(
  orgId: string,
  provider: string,
  creds: { accessToken?: string; refreshToken?: string; tokenExpiry?: string; extra?: Record<string, unknown> }
): Promise<void> {
  const existing = (await db
    .prepare("SELECT id FROM integrations WHERE org_id = ? AND provider = ?")
    .get(orgId, provider)) as { id: string } | undefined;
  const extraJson = creds.extra ? JSON.stringify(creds.extra) : null;
  if (existing) {
    await db
      .prepare(
        "UPDATE integrations SET connected = 1, connected_at = ?, access_token = COALESCE(?, access_token), refresh_token = COALESCE(?, refresh_token), token_expiry = ?, extra = COALESCE(?, extra) WHERE id = ?"
      )
      .run(new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson, existing.id);
  } else {
    await db
      .prepare(
        "INSERT INTO integrations (id, org_id, provider, connected, connected_at, access_token, refresh_token, token_expiry, extra) VALUES (?,?,?,1,?,?,?,?,?)"
      )
      .run(newId(), orgId, provider, new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson);
  }
}

/** `incomplete` is a new-signup org that hasn't finished Stripe Checkout yet
 * (card not confirmed) — blocked from /app/* exactly like `suspended`, see
 * isAccessBlocked below. Every other status is unchanged. */
export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "suspended";

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
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_cancel_at_period_end: number;
  match_opt_in: number;
  match_headline: string | null;
  match_sector: string | null;
  match_offering: string | null;
  match_looking_for: string | null;
  match_contact_email: string | null;
  match_contact_phone: string | null;
  match_updated_at: string | null;
  match_featured_active: number;
  match_featured_stripe_subscription_id: string | null;
  match_featured_period_end: string | null;
  match_featured_cancel_at_period_end: number;
};

export async function getOrganization(orgId: string): Promise<Organization | undefined> {
  return (await db.prepare("SELECT * FROM organizations WHERE id = ?").get(orgId)) as Organization | undefined;
}

export type MatchProfileInput = {
  optIn: boolean;
  headline: string;
  sector: string;
  offering: string;
  lookingFor: string;
  contactEmail: string;
  contactPhone: string;
};

export type MatchProfile = {
  orgId: string;
  orgName: string;
  headline: string | null;
  sector: string | null;
  offering: string | null;
  lookingFor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  updatedAt: string | null;
  featured: boolean;
  /** "org" = a real Pearl customer's self-declared card; "sponsor" = an
   * external listing AHEAD LLC sold and manages from the Owner Dashboard
   * (monetization point #4) — kept distinct so the UI can label it. */
  kind: "org" | "sponsor";
};

/**
 * Saves an org's own "Business Match" card — see the migration note in
 * db.ts for why this is a deliberately separate, self-declared profile
 * rather than anything derived from the org's CRM contacts. Turning
 * optIn off immediately drops the org out of listMatchProfiles for
 * everyone else, without deleting the filled-in fields (so re-enabling
 * later doesn't mean retyping everything).
 */
export async function updateMatchProfile(orgId: string, input: MatchProfileInput): Promise<void> {
  await db
    .prepare(
      `UPDATE organizations
       SET match_opt_in = ?, match_headline = ?, match_sector = ?, match_offering = ?,
           match_looking_for = ?, match_contact_email = ?, match_contact_phone = ?, match_updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.optIn ? 1 : 0,
      input.headline.trim() || null,
      input.sector.trim() || null,
      input.offering.trim() || null,
      input.lookingFor.trim() || null,
      input.contactEmail.trim() || null,
      input.contactPhone.trim() || null,
      new Date().toISOString(),
      orgId
    );
}

/** The other side of the directory: every opted-in org except the caller's
 * own, plus every active sponsor listing, optionally narrowed by a
 * free-text search across sector/headline/offering/looking-for. Never
 * touches contacts/deals — only the self-declared match_* columns and the
 * separate sponsor table, which is the whole privacy point. Featured orgs
 * (monetization point #1) sort first. */
export async function listMatchProfiles(excludeOrgId: string, search?: string): Promise<MatchProfile[]> {
  const clauses = ["match_opt_in = 1", "id != ?"];
  const params: any[] = [excludeOrgId];
  if (search) {
    clauses.push("(match_headline ILIKE ? OR match_sector ILIKE ? OR match_offering ILIKE ? OR match_looking_for ILIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const orgRows = await db
    .prepare(
      `SELECT id, name, match_headline, match_sector, match_offering, match_looking_for,
              match_contact_email, match_contact_phone, match_updated_at, match_featured_active
       FROM organizations
       WHERE ${clauses.join(" AND ")}
       ORDER BY match_featured_active DESC, match_updated_at DESC`
    )
    .all(...params);

  const sponsorClauses = ["active = 1"];
  const sponsorParams: any[] = [];
  if (search) {
    sponsorClauses.push("(headline ILIKE ? OR sector ILIKE ? OR offering ILIKE ? OR looking_for ILIKE ?)");
    const like = `%${search}%`;
    sponsorParams.push(like, like, like, like);
  }
  const sponsorRows = await db
    .prepare(
      `SELECT id, name, headline, sector, offering, looking_for, contact_email, contact_phone, created_at
       FROM match_sponsors
       WHERE ${sponsorClauses.join(" AND ")}
       ORDER BY created_at DESC`
    )
    .all(...sponsorParams);

  const orgs: MatchProfile[] = orgRows.map((r: any) => ({
    orgId: r.id,
    orgName: r.name,
    headline: r.match_headline,
    sector: r.match_sector,
    offering: r.match_offering,
    lookingFor: r.match_looking_for,
    contactEmail: r.match_contact_email,
    contactPhone: r.match_contact_phone,
    updatedAt: r.match_updated_at,
    featured: !!r.match_featured_active,
    kind: "org",
  }));
  const sponsors: MatchProfile[] = sponsorRows.map((r: any) => ({
    orgId: r.id,
    orgName: r.name,
    headline: r.headline,
    sector: r.sector,
    offering: r.offering,
    lookingFor: r.looking_for,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    updatedAt: r.created_at,
    featured: true, // sponsors are a paid placement — always shown first, like featured orgs
    kind: "sponsor",
  }));

  // Sponsors and featured orgs both lead the list; sponsors first since
  // they're a direct AHEAD LLC commercial placement.
  return [...sponsors, ...orgs];
}

/** Turns on/off (or renews) the paid "in evidenza" placement for one org —
 * see the migration note in db.ts for why this never touches the org's
 * main plan/subscription_status. Called from both the Stripe Checkout
 * success redirect and the webhook (same "whichever lands first wins"
 * pattern as applyStripeSubscription). */
export async function applyFeaturedSubscription(
  orgId: string,
  sub: { subscriptionId: string; status: SubscriptionStatus; periodEndIso: string | null; cancelAtPeriodEnd: boolean }
): Promise<void> {
  const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  await db
    .prepare(
      `UPDATE organizations SET
       match_featured_active = ?,
       match_featured_stripe_subscription_id = ?,
       match_featured_period_end = COALESCE(?, match_featured_period_end),
       match_featured_cancel_at_period_end = ?
     WHERE id = ?`
    )
    .run(active ? 1 : 0, sub.subscriptionId, sub.periodEndIso, sub.cancelAtPeriodEnd ? 1 : 0, orgId);
}

/* ---------------------------------------------------------------------- *
 * Sponsor listings (monetization point #4) — external, Owner-managed
 * placements in the Business Match directory. See the match_sponsors
 * table comment in db.ts.
 * ---------------------------------------------------------------------- */

export type SponsorInput = {
  name: string;
  headline: string;
  sector: string;
  offering: string;
  lookingFor: string;
  contactEmail: string;
  contactPhone: string;
};

export type Sponsor = SponsorInput & { id: string; active: boolean; createdAt: string };

export async function listAllSponsors(): Promise<Sponsor[]> {
  const rows = await db.prepare(`SELECT * FROM match_sponsors ORDER BY created_at DESC`).all();
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    headline: r.headline ?? "",
    sector: r.sector ?? "",
    offering: r.offering ?? "",
    lookingFor: r.looking_for ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    active: !!r.active,
    createdAt: r.created_at,
  }));
}

export async function createSponsor(input: SponsorInput): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO match_sponsors (id, name, headline, sector, offering, looking_for, contact_email, contact_phone, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      id,
      input.name.trim(),
      input.headline.trim() || null,
      input.sector.trim() || null,
      input.offering.trim() || null,
      input.lookingFor.trim() || null,
      input.contactEmail.trim() || null,
      input.contactPhone.trim() || null,
      new Date().toISOString()
    );
  return id;
}

export async function setSponsorActive(id: string, active: boolean): Promise<void> {
  await db.prepare(`UPDATE match_sponsors SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}

export async function deleteSponsor(id: string): Promise<void> {
  await db.prepare(`DELETE FROM match_sponsors WHERE id = ?`).run(id);
}

/* ---------------------------------------------------------------------- *
 * Feature-interest survey — the one-click "would you want a Real Estate
 * CRM module?" banner. Recorded per user so the Owner Dashboard can see
 * both raw sentiment and which companies said yes.
 * ---------------------------------------------------------------------- */

const REAL_ESTATE_CRM_FEATURE = "real_estate_crm";

export async function hasAnsweredFeatureInterest(userId: string, feature = REAL_ESTATE_CRM_FEATURE): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM feature_interest_responses WHERE feature = ? AND user_id = ?`)
    .get(feature, userId);
  return !!row;
}

export async function recordFeatureInterest(
  params: { orgId: string; userId: string; answer: "yes" | "maybe" | "no" },
  feature = REAL_ESTATE_CRM_FEATURE
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feature_interest_responses (id, feature, org_id, user_id, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (feature, user_id) DO UPDATE SET answer = EXCLUDED.answer, created_at = EXCLUDED.created_at`
    )
    .run(newId(), feature, params.orgId, params.userId, params.answer, new Date().toISOString());
}

export type FeatureInterestRow = { orgName: string; userName: string; answer: string; createdAt: string };

export async function listFeatureInterest(feature = REAL_ESTATE_CRM_FEATURE): Promise<FeatureInterestRow[]> {
  const rows = await db
    .prepare(
      `SELECT o.name as org_name, u.name as user_name, r.answer, r.created_at
       FROM feature_interest_responses r
       JOIN organizations o ON o.id = r.org_id
       JOIN users u ON u.id = r.user_id
       WHERE r.feature = ?
       ORDER BY r.created_at DESC`
    )
    .all(feature);
  return rows.map((r: any) => ({ orgName: r.org_name, userName: r.user_name, answer: r.answer, createdAt: r.created_at }));
}

/** Who a billing email for this org should go to — the earliest-created
 * ADMIN account (normally the person who signed up), falling back to
 * whichever user exists first if an org somehow has no ADMIN. */
export async function getOrgBillingContactEmail(orgId: string): Promise<string | null> {
  const row = (await db
    .prepare(
      `SELECT email FROM users WHERE org_id = ?
       ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`
    )
    .get(orgId)) as { email: string } | undefined;
  return row?.email ?? null;
}

/** Whether /app/* should redirect to the renewal screen. A `past_due` org
 * (period — or trial — over, still inside its grace window) keeps full
 * access; `suspended` blocks it, and so does `incomplete` (a brand-new
 * signup that hasn't finished Stripe Checkout, so no trial has actually
 * started yet). A `trialing` org is only moved to `past_due` once its trial
 * actually expires (see listTrialsToExpire in the daily cron sweep), so
 * access is never blocked mid-trial. */
export function isAccessBlocked(org: Organization): boolean {
  return org.subscription_status === "suspended" || org.subscription_status === "incomplete";
}

/** Applies a normalized Stripe subscription (see src/lib/stripe.ts) to an
 * org row — the single write path used by the Checkout success redirect
 * (api/billing/stripe/confirm) AND the webhook, so whichever one lands
 * first "wins" and the other is just a harmless repeat of the same write.
 * Unlike the old Ziina flow this never stacks a period length onto the
 * org's own clock — Stripe is the source of truth for the period end. */
export async function applyStripeSubscription(
  orgId: string,
  sub: {
    customerId: string;
    subscriptionId: string;
    status: SubscriptionStatus;
    intervalId: BillingIntervalId | null;
    periodEndIso: string | null;
    cancelAtPeriodEnd: boolean;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE organizations SET
       stripe_customer_id = ?,
       stripe_subscription_id = ?,
       subscription_status = ?,
       billing_interval = COALESCE(?, billing_interval),
       plan = COALESCE(?, plan),
       billing_period_end = COALESCE(?, billing_period_end),
       stripe_cancel_at_period_end = ?
     WHERE id = ?`
    )
    .run(
      sub.customerId,
      sub.subscriptionId,
      sub.status,
      sub.intervalId,
      sub.intervalId,
      sub.periodEndIso,
      sub.cancelAtPeriodEnd ? 1 : 0,
      orgId
    );
}

/** An org whose subscription is entirely Stripe-managed (has a
 * stripe_subscription_id) is excluded from the legacy manual grace/suspend
 * sweep below — Stripe's own webhooks (customer.subscription.updated/
 * deleted, via applyStripeSubscription) are the sole source of truth for
 * those orgs' status. The legacy sweep still applies to: orgs that signed
 * up before this Stripe migration and are still on a card-less trial, and
 * orgs given a plan manually from the Owner Dashboard (bank transfer /
 * cash — see grantManualPlan), neither of which has a Stripe subscription. */
export async function findOrgByStripeSubscriptionId(subscriptionId: string): Promise<Organization | undefined> {
  return (await db.prepare("SELECT * FROM organizations WHERE stripe_subscription_id = ?").get(subscriptionId)) as
    | Organization
    | undefined;
}

/** Kicks off a renewal/upgrade: remembers which Ziina payment intent is in
 * flight for which interval, so the success-page check and the webhook can
 * both recognize it (and so a second, unrelated payment intent for the same
 * org can't be mistaken for this one). */
export async function setPendingPaymentIntent(orgId: string, paymentIntentId: string, interval: BillingIntervalId): Promise<void> {
  await db.prepare("UPDATE organizations SET pending_payment_intent_id = ?, pending_interval = ? WHERE id = ?").run(
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
export async function applyCompletedPayment(orgId: string, paymentIntentId: string): Promise<boolean> {
  const org = await getOrganization(orgId);
  if (!org) return false;
  if (org.last_applied_payment_intent_id === paymentIntentId) return false;
  if (org.pending_payment_intent_id !== paymentIntentId) return false;

  const interval = org.pending_interval;
  const plan = BILLING_PLANS.find((p) => p.id === interval);
  if (!plan) return false;

  const currentEnd = org.billing_period_end ? new Date(org.billing_period_end).getTime() : 0;
  const base = currentEnd > Date.now() ? currentEnd : Date.now();
  const newEnd = new Date(base + plan.days * 24 * 3600 * 1000).toISOString();

  await db
    .prepare(
      `UPDATE organizations
     SET plan = ?, billing_interval = ?, billing_period_end = ?, subscription_status = 'active',
         grace_until = NULL, pending_payment_intent_id = NULL, pending_interval = NULL,
         last_applied_payment_intent_id = ?
     WHERE id = ?`
    )
    .run(interval, interval, newEnd, paymentIntentId, orgId);
  return true;
}

/** Orgs whose paid period has ended: first pass moves them into their grace
 * window and (by returning them here) triggers a fresh renewal email; a
 * later pass — once `grace_until` itself is past — suspends access. Used by
 * the daily /api/billing/cron check. */
export async function listOrgsToMoveToGrace(): Promise<Organization[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM organizations
       WHERE subscription_status = 'active' AND billing_period_end IS NOT NULL AND billing_period_end < ?
         AND stripe_subscription_id IS NULL`
    )
    .all(new Date().toISOString());
  return rows as Organization[];
}

export async function moveOrgToGrace(orgId: string): Promise<void> {
  const graceUntil = new Date(Date.now() + BILLING_GRACE_DAYS * 24 * 3600 * 1000).toISOString();
  await db.prepare("UPDATE organizations SET subscription_status = 'past_due', grace_until = ? WHERE id = ?").run(graceUntil, orgId);
}

/** Orgs whose free trial has simply run out with no plan ever chosen — a
 * separate case from a paid period ending, since there's no billing_period_end
 * to compare against. Feeds into the exact same past_due/grace pipeline as a
 * lapsed paid plan (moveOrgToGrace / listOrgsToSuspend), so "the trial ended"
 * and "the subscription lapsed" both resolve the same way: a few days of
 * grace, then /billing-required. */
export async function listTrialsToExpire(): Promise<Organization[]> {
  const rows = await db
    .prepare(`SELECT * FROM organizations WHERE subscription_status = 'trialing' AND trial_ends_at < ?`)
    .all(new Date().toISOString());
  return rows as Organization[];
}

export async function listOrgsToSuspend(): Promise<Organization[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM organizations
       WHERE subscription_status = 'past_due' AND grace_until IS NOT NULL AND grace_until < ?
         AND stripe_subscription_id IS NULL`
    )
    .all(new Date().toISOString());
  return rows as Organization[];
}

export async function suspendOrg(orgId: string): Promise<void> {
  await db.prepare("UPDATE organizations SET subscription_status = 'suspended' WHERE id = ?").run(orgId);
}

/** Looks up which org a Ziina webhook event belongs to, by the payment
 * intent id it carries — webhooks don't know our internal org ids, only
 * Ziina's own payment_intent id, which we stashed on the org row when the
 * checkout started (see setPendingPaymentIntent). */
export async function findOrgByPendingPaymentIntent(paymentIntentId: string): Promise<Organization | undefined> {
  return (await db.prepare("SELECT * FROM organizations WHERE pending_payment_intent_id = ?").get(paymentIntentId)) as
    | Organization
    | undefined;
}

/** Alerts: open deals gone quiet, sorted by urgency desc. */
export async function listAlerts(orgId: string) {
  const deals = await listDeals(orgId);
  return deals
    .filter((d) => !d.stage.startsWith("closed"))
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

export async function listCampaigns(orgId: string): Promise<Campaign[]> {
  const rows = await db.prepare("SELECT * FROM campaigns WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
  return rows.map(toCampaign);
}

export async function getCampaign(orgId: string, campaignId: string): Promise<Campaign | null> {
  const r = await db.prepare("SELECT * FROM campaigns WHERE org_id = ? AND id = ?").get(orgId, campaignId);
  return r ? toCampaign(r) : null;
}

export type CampaignSegment = { interest?: string; budgetTier?: string; targetSegment?: string };

/** Contacts matching a campaign's targeting filters — used both for the live "N recipients" preview and at send time. */
export async function audienceForSegment(orgId: string, segment: CampaignSegment): Promise<Contact[]> {
  return listContacts(orgId, {
    interest: segment.interest || undefined,
    budgetTier: segment.budgetTier || undefined,
    targetSegment: segment.targetSegment || undefined,
  });
}

export async function createCampaign(
  orgId: string,
  input: { title: string; message: string; channel: string; segment: CampaignSegment }
): Promise<Campaign> {
  const cid = newId();
  await db
    .prepare(
      `INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
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
  return (await getCampaign(orgId, cid))!;
}

/**
 * Simulated send — matches the same pattern as the Gmail/WhatsApp/Calendar
 * integrations elsewhere in this MVP: no real message goes out, but the
 * audience match, recipient count and per-contact activity log are all real,
 * so the workflow is genuinely demoable end to end.
 */
export async function sendCampaign(orgId: string, campaignId: string): Promise<Campaign | null> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) return null;
  const audience = await audienceForSegment(orgId, {
    interest: campaign.segmentInterest || undefined,
    budgetTier: campaign.segmentBudgetTier || undefined,
    targetSegment: campaign.segmentTargetSegment || undefined,
  });
  const sentAt = new Date().toISOString();
  await db
    .prepare("UPDATE campaigns SET status = 'sent', recipient_count = ?, sent_at = ? WHERE id = ? AND org_id = ?")
    .run(audience.length, sentAt, campaignId, orgId);
  for (const contact of audience) {
    await db
      .prepare(
        "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .run(newId(), orgId, contact.id, null, campaign.channel, `Campaign sent: ${campaign.title}`, sentAt, sentAt);
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

export async function listCustomAlerts(orgId: string, opts: { onlyOpen?: boolean } = {}): Promise<CustomAlert[]> {
  const rows = await db
    .prepare(
      `SELECT ca.*, c.name as contact_name
       FROM custom_alerts ca LEFT JOIN contacts c ON c.id = ca.contact_id
       WHERE ca.org_id = ? ${opts.onlyOpen ? "AND ca.done = 0" : ""}
       ORDER BY ca.remind_at ASC`
    )
    .all(orgId);
  return rows.map(toCustomAlert);
}

export async function createCustomAlert(
  orgId: string,
  title: string,
  remindAt: string,
  kind: AlertKind = "general",
  contactId: string | null = null
): Promise<CustomAlert> {
  const aid = newId();
  await db
    .prepare("INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at, kind, contact_id) VALUES (?,?,?,?,?,?,?,?)")
    .run(aid, orgId, title.trim(), remindAt, 0, new Date().toISOString(), kind, contactId);
  const all = await listCustomAlerts(orgId);
  return all.find((a) => a.id === aid)!;
}

export async function toggleCustomAlert(orgId: string, alertId: string, done: boolean): Promise<void> {
  await db.prepare("UPDATE custom_alerts SET done = ? WHERE org_id = ? AND id = ?").run(done ? 1 : 0, orgId, alertId);
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

export async function listAllOrganizations(): Promise<OrgSummary[]> {
  const rows = (await db
    .prepare(
      `SELECT o.id, o.name, o.plan, o.trial_ends_at, o.promo_bonus_days, o.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
              (SELECT COUNT(*) FROM contacts c WHERE c.org_id = o.id) AS contact_count,
              (SELECT COUNT(*) FROM deals d WHERE d.org_id = o.id) AS deal_count
       FROM organizations o
       ORDER BY o.created_at DESC`
    )
    .all()) as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    plan: r.plan,
    trialEndsAt: r.trial_ends_at,
    promoBonusDays: r.promo_bonus_days,
    createdAt: r.created_at,
    userCount: Number(r.user_count),
    contactCount: Number(r.contact_count),
    dealCount: Number(r.deal_count),
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

export async function listAllUsers(): Promise<PlatformUser[]> {
  const rows = (await db
    .prepare(
      `SELECT u.id, u.org_id, o.name AS org_name, u.name, u.email, u.role, u.created_at
       FROM users u JOIN organizations o ON o.id = u.org_id
       ORDER BY u.created_at DESC`
    )
    .all()) as any[];
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
export async function listAllContacts(): Promise<PlatformContact[]> {
  const rows = (await db
    .prepare(
      `SELECT ct.id, ct.org_id, o.name AS org_name, ct.name, ct.email, ct.phone,
              co.name AS company_name, ct.interest, ct.budget_tier, ct.target_segment,
              ct.temperature, ct.source, ct.created_at
       FROM contacts ct
       JOIN organizations o ON o.id = ct.org_id
       LEFT JOIN companies co ON co.id = ct.company_id
       ORDER BY o.name ASC, ct.created_at DESC`
    )
    .all()) as any[];
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

export async function platformStats() {
  const orgs = await listAllOrganizations();
  const now = Date.now();
  return {
    totalOrgs: orgs.length,
    totalUsers: orgs.reduce((s, o) => s + o.userCount, 0),
    totalContacts: orgs.reduce((s, o) => s + o.contactCount, 0),
    activeTrials: orgs.filter((o) => o.plan === "trial" && new Date(o.trialEndsAt).getTime() > now).length,
    expiredTrials: orgs.filter((o) => o.plan === "trial" && new Date(o.trialEndsAt).getTime() <= now).length,
  };
}

export async function extendTrial(orgId: string, days: number): Promise<void> {
  const org = await getOrganization(orgId);
  if (!org) return;
  const base = Math.max(new Date(org.trial_ends_at).getTime(), Date.now());
  const newEnd = new Date(base + days * 24 * 3600 * 1000).toISOString();
  await db.prepare("UPDATE organizations SET trial_ends_at = ?, promo_bonus_days = promo_bonus_days + ? WHERE id = ?").run(
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
export async function grantManualPlan(orgId: string, interval: BillingIntervalId): Promise<void> {
  const plan = BILLING_PLANS.find((p) => p.id === interval);
  if (!plan) return;
  const org = await getOrganization(orgId);
  if (!org) return;
  const currentEnd = org.billing_period_end ? new Date(org.billing_period_end).getTime() : 0;
  const base = currentEnd > Date.now() ? currentEnd : Date.now();
  const newEnd = new Date(base + plan.days * 24 * 3600 * 1000).toISOString();
  await db
    .prepare(
      `UPDATE organizations SET plan = ?, billing_interval = ?, billing_period_end = ?, subscription_status = 'active', grace_until = NULL WHERE id = ?`
    )
    .run(interval, interval, newEnd, orgId);
}

export async function dashboardStats(orgId: string) {
  const deals = await listDeals(orgId);
  const open = deals.filter((d) => !d.stage.startsWith("closed"));
  const won = deals.filter((d) => d.stage === "closed_won");
  const lost = deals.filter((d) => d.stage === "closed_lost");
  const pipelineValue = open.reduce((s, d) => s + d.value, 0);
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const conversionRate = deals.length > 0 ? Math.round((won.length / (won.length + lost.length || 1)) * 100) : 0;
  const openAlerts = await listCustomAlerts(orgId, { onlyOpen: true });
  const dueCustomAlerts = openAlerts.filter((a) => new Date(a.remindAt).getTime() <= Date.now());
  const dealsAtRisk = (await listAlerts(orgId)).slice(0, 5);
  return {
    pipelineValue,
    wonValue,
    openCount: open.length,
    wonCount: won.length,
    conversionRate,
    dealsAtRisk,
    dueCustomAlerts,
  };
}

/* ---------------------------------------------------------------------- *
 * Web Push subscriptions + the notification sweep. See src/lib/push.ts
 * for the actual sending; this section is just the storage and the
 * "what needs a push right now" queries used by /api/push/cron.
 * ---------------------------------------------------------------------- */

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export async function savePushSubscription(
  orgId: string,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, org_id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET org_id = EXCLUDED.org_id, user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`
    )
    .run(newId(), orgId, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString());
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export async function hasPushSubscription(userId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM push_subscriptions WHERE user_id = ?").get(userId);
  return !!row;
}

export async function listPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  const rows = await db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .all(userId);
  return rows as PushSubscriptionRow[];
}

/** Every subscribed device belonging to an ADMIN of one org — used for
 * account-level pushes (payment failed, trial ending) rather than
 * per-salesperson ones. */
export async function listPushSubscriptionsForOrgAdmins(orgId: string): Promise<PushSubscriptionRow[]> {
  const rows = await db
    .prepare(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.org_id = ? AND u.role = 'ADMIN'`
    )
    .all(orgId);
  return rows as PushSubscriptionRow[];
}

/** All subscribed devices for an org, used as the fallback for a due alert
 * that isn't tied to any one contact/owner — better everyone sees it once
 * than no one gets notified at all. */
export async function listPushSubscriptionsForOrg(orgId: string): Promise<PushSubscriptionRow[]> {
  const rows = await db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE org_id = ?").all(orgId);
  return rows as PushSubscriptionRow[];
}

export type DueAlertForPush = { id: string; orgId: string; title: string; contactOwnerId: string | null };

/** Custom alerts (and the existing "reactivate today" reminders share this
 * table's `kind`) that are due and haven't been pushed yet. Notifying the
 * linked contact's owner (the salesperson who actually owns that lead) when
 * there is one, so the push lands with the person who needs to act on it —
 * not the whole company. */
export async function listDueAlertsForPush(): Promise<DueAlertForPush[]> {
  const rows = await db
    .prepare(
      `SELECT ca.id, ca.org_id, ca.title, c.owner_id as contact_owner_id
       FROM custom_alerts ca LEFT JOIN contacts c ON c.id = ca.contact_id
       WHERE ca.done = 0 AND ca.notified_push_at IS NULL AND ca.remind_at <= ?`
    )
    .all(new Date().toISOString());
  return rows.map((r: any) => ({ id: r.id, orgId: r.org_id, title: r.title, contactOwnerId: r.contact_owner_id }));
}

export async function markAlertPushNotified(alertId: string): Promise<void> {
  await db.prepare("UPDATE custom_alerts SET notified_push_at = ? WHERE id = ?").run(new Date().toISOString(), alertId);
}

export type DueTaskForPush = { id: string; orgId: string; title: string; dueDate: string; ownerId: string | null };

/** Tasks due today or tomorrow, not yet pushed — "tomorrow" as well as
 * "today" so a task due first thing in the morning still gets a heads-up
 * the evening before, not only once it's already due. */
export async function listTasksDueSoonForPush(): Promise<DueTaskForPush[]> {
  const tomorrowEnd = new Date();
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);
  const rows = await db
    .prepare(
      `SELECT id, org_id, title, due_date, owner_id
       FROM tasks
       WHERE done = 0 AND notified_push_at IS NULL AND due_date IS NOT NULL AND due_date <= ?`
    )
    .all(tomorrowEnd.toISOString());
  return rows.map((r: any) => ({ id: r.id, orgId: r.org_id, title: r.title, dueDate: r.due_date, ownerId: r.owner_id }));
}

export async function markTaskPushNotified(taskId: string): Promise<void> {
  await db.prepare("UPDATE tasks SET notified_push_at = ? WHERE id = ?").run(new Date().toISOString(), taskId);
}
