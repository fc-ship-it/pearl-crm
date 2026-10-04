import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, id as newId } from "@/lib/db";
import {
  urgencyScore,
  urgencyLevel,
  addressArea,
  WEEKDAY_LABELS,
  stageConfig,
  BILLING_PLANS,
  BILLING_GRACE_DAYS,
  normalizeEmail,
  normalizePhone,
  daysSinceLastContact,
  FOLLOW_UP_STALE_DAYS,
  type BillingIntervalId,
} from "@/lib/domain";

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
  contactAddress?: string | null;
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
  /** Free-text street address — no geocoding. Powers the "Open in Google
   * Maps" link and the "Plan my week" proximity grouping. */
  address: string | null;
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
  /** True → only contacts that haven't had an interaction (or, if they've
   * never had one, weren't even created) in the last FOLLOW_UP_STALE_DAYS —
   * the "needs a follow-up" view. Filtered in JS after the query (not SQL)
   * since it has to fall back to created_at per-row the same way
   * daysSinceLastContact does, which COALESCE alone in the ORDER/WHERE
   * clause would duplicate awkwardly for little benefit at this data size. */
  staleOnly?: boolean;
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
  /** 'zoom' | 'google_meet' | 'in_person' — null on meetings logged before
   * this existed. See MEETING_LOCATION_TYPES in domain.ts. */
  locationType: string | null;
  /** The Zoom/Meet link, or the physical address — meaning depends on locationType. */
  locationDetail: string | null;
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
    contactAddress: r.contact_address ?? null,
  };
}

/**
 * `viewerOwnerId`: pass the logged-in user's id to restrict results to deals
 * THEY own (used for a "SALES" role teammate); leave undefined to see the
 * whole org's deals (ADMIN, or any org that hasn't added teammates). See
 * Settings -> Team and the `role` column on `users`.
 */
export async function listDeals(orgId: string, viewerOwnerId?: string): Promise<Deal[]> {
  const clauses = ["d.org_id = ?"];
  const params: any[] = [orgId];
  if (viewerOwnerId) {
    clauses.push("d.owner_id = ?");
    params.push(viewerOwnerId);
  }
  const rows = await db
    .prepare(
      `SELECT d.*, c.name as contact_name, c.address as contact_address, co.name as company_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY d.created_at DESC`
    )
    .all(...params);
  return rows.map(toDeal);
}

/** Same `viewerOwnerId` restriction as listDeals — pass it to make sure a
 * SALES teammate can't open another teammate's deal by guessing its id. */
export async function getDeal(orgId: string, dealId: string, viewerOwnerId?: string): Promise<Deal | null> {
  const clauses = ["d.org_id = ?", "d.id = ?"];
  const params: any[] = [orgId, dealId];
  if (viewerOwnerId) {
    clauses.push("d.owner_id = ?");
    params.push(viewerOwnerId);
  }
  const r = await db
    .prepare(
      `SELECT d.*, c.name as contact_name, c.address as contact_address, co.name as company_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE ${clauses.join(" AND ")}`
    )
    .get(...params);
  return r ? toDeal(r) : null;
}

export type NewDealInput = {
  title: string;
  value: number;
  contactId?: string | null;
  stage?: string;
  ownerId?: string | null;
  expectedCloseDate?: string | null;
};

/** Rough default probability by stage, used only when a deal is created
 * without picking one by hand — same shape as the demo seed data uses
 * (closed_won/closed_lost are fixed; everything else scales with the
 * stage's urgency weight from domain.ts). */
function defaultProbability(stage: string): number {
  if (stage === "closed_won") return 100;
  if (stage === "closed_lost") return 0;
  return Math.round(stageConfig(stage).weight * 40);
}

/**
 * Creates a deal from scratch — the one path that was missing: until this,
 * every deal in the app came from the demo seed data, with no way for a
 * real customer to add their own. Optionally attached to an existing
 * contact (inherits that contact's company); `ownerId` should be set for a
 * "SALES" teammate creating their own deal so it shows up in their scoped
 * pipeline right away.
 */
export async function createDeal(orgId: string, input: NewDealInput): Promise<Deal> {
  const dealId = newId();
  const now = new Date().toISOString();
  const stage = input.stage || "lead";

  let companyId: string | null = null;
  if (input.contactId) {
    const contactRow = (await db.prepare("SELECT company_id FROM contacts WHERE org_id = ? AND id = ?").get(orgId, input.contactId)) as
      | { company_id: string | null }
      | undefined;
    companyId = contactRow?.company_id ?? null;
  }

  await db
    .prepare(
      `INSERT INTO deals (id, org_id, contact_id, company_id, title, value, stage, probability, owner_id, expected_close_date, last_interaction_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      dealId,
      orgId,
      input.contactId || null,
      companyId,
      input.title.trim(),
      input.value,
      stage,
      defaultProbability(stage),
      input.ownerId || null,
      input.expectedCloseDate || null,
      now,
      now
    );
  return (await getDeal(orgId, dealId))!;
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
    address: r.address ?? null,
  };
}

export async function setContactTemperature(orgId: string, contactId: string, temperature: LeadTemperature | null): Promise<void> {
  await db.prepare("UPDATE contacts SET temperature = ? WHERE org_id = ? AND id = ?").run(temperature, orgId, contactId);
}

/** Free-text street address — shown on the contact + used for the Google
 * Maps link and "Plan my week" proximity grouping. Pass "" or null to clear. */
export async function setContactAddress(orgId: string, contactId: string, address: string | null): Promise<void> {
  await db.prepare("UPDATE contacts SET address = ? WHERE org_id = ? AND id = ?").run(address?.trim() || null, orgId, contactId);
}

/**
 * Deletes a contact and everything that only makes sense attached to that
 * contact (its logged activities, its tasks, its meetings, its reminders,
 * its photo attachments — including photos attached to its meetings, which
 * would otherwise block the meeting delete below via their own foreign
 * key). Deals are kept but detached (contact_id set to null) rather than
 * deleted, since a deal is a financial record worth preserving even if the
 * contact behind it goes away — its own attachments go with it untouched.
 * All of this has to happen before the DELETE on `contacts` itself, since
 * every one of those tables has a foreign key pointing at it and Postgres
 * (unlike the old SQLite driver) actually enforces that at commit time.
 */
export async function deleteContact(orgId: string, contactId: string): Promise<void> {
  await db.prepare("DELETE FROM activities WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM tasks WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM attachments WHERE org_id = ? AND meeting_id IN (SELECT id FROM meetings WHERE org_id = ? AND contact_id = ?)").run(orgId, orgId, contactId);
  await db.prepare("DELETE FROM meetings WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM custom_alerts WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
  await db.prepare("DELETE FROM attachments WHERE org_id = ? AND contact_id = ?").run(orgId, contactId);
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
export async function deleteContacts(orgId: string, contactIds: string[], viewerOwnerId?: string): Promise<number> {
  if (contactIds.length === 0) return 0;
  if (viewerOwnerId) {
    // A "SALES" teammate can only bulk-delete contacts THEY own — narrow the
    // id list down to that subset first, so a tampered request can't reach
    // another teammate's contacts (and the cascade deletes below, which key
    // only off contact_id, stay correctly scoped too).
    const owned = (await db
      .prepare("SELECT id FROM contacts WHERE org_id = ? AND owner_id = ? AND id = ANY(?::text[])")
      .all(orgId, viewerOwnerId, contactIds)) as { id: string }[];
    contactIds = owned.map((r) => r.id);
    if (contactIds.length === 0) return 0;
  }
  await db.prepare("DELETE FROM activities WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM tasks WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db
    .prepare("DELETE FROM attachments WHERE org_id = ? AND meeting_id IN (SELECT id FROM meetings WHERE org_id = ? AND contact_id = ANY(?::text[]))")
    .run(orgId, orgId, contactIds);
  await db.prepare("DELETE FROM meetings WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM custom_alerts WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("DELETE FROM attachments WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  await db.prepare("UPDATE deals SET contact_id = NULL WHERE org_id = ? AND contact_id = ANY(?::text[])").run(orgId, contactIds);
  const result = await db.prepare("DELETE FROM contacts WHERE org_id = ? AND id = ANY(?::text[])").run(orgId, contactIds);
  return result.changes;
}

/**
 * `viewerOwnerId`: pass the logged-in user's id to restrict results to
 * contacts THEY own (a "SALES" role teammate); leave undefined for the whole
 * org's contacts (ADMIN). See listDeals above for the same pattern.
 */
export async function listContacts(orgId: string, filters: ContactFilters = {}, viewerOwnerId?: string): Promise<Contact[]> {
  const clauses = ["ct.org_id = ?"];
  const params: any[] = [orgId];
  if (viewerOwnerId) {
    clauses.push("ct.owner_id = ?");
    params.push(viewerOwnerId);
  }
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
  const contacts = rows.map(toContact);
  if (!filters.staleOnly) return contacts;
  return contacts.filter((c) => daysSinceLastContact(c) >= FOLLOW_UP_STALE_DAYS);
}

/** Same `viewerOwnerId` restriction as listContacts — pass it to make sure a
 * SALES teammate can't open another teammate's contact by guessing its id. */
export async function getContact(orgId: string, contactId: string, viewerOwnerId?: string): Promise<Contact | null> {
  const clauses = ["ct.org_id = ?", "ct.id = ?"];
  const params: any[] = [orgId, contactId];
  if (viewerOwnerId) {
    clauses.push("ct.owner_id = ?");
    params.push(viewerOwnerId);
  }
  const r = await db
    .prepare(
      `SELECT ct.*, co.name as company_name
       FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
       WHERE ${clauses.join(" AND ")}`
    )
    .get(...params);
  return r ? toContact(r) : null;
}

export type DuplicateContactGroup = {
  /** The normalized email/phone the contacts in this group share. */
  key: string;
  matchType: "email" | "phone";
  contacts: Contact[];
};

/** Groups a contact list into duplicate clusters by normalized email or
 * normalized phone (see normalizeEmail/normalizePhone in domain.ts) — a
 * manual data-hygiene pass for whatever's already in the database, distinct
 * from importContacts' own normalized check, which only prevents NEW
 * duplicates going forward. Loads the whole org's contacts once; at a few
 * thousand rows this is trivial for Node to group in memory, and avoids
 * needing normalized columns/indexes in Postgres just for this.
 *
 * `ownerId`, when passed, restricts both the candidate pool and each
 * returned group to contacts owned by that one teammate — a SALES
 * teammate's duplicate-finder should never surface, let alone let them
 * merge, a contact that belongs to someone else. */
export async function findDuplicateContactGroups(orgId: string, ownerId?: string): Promise<DuplicateContactGroup[]> {
  const clauses = ["ct.org_id = ?"];
  const params: any[] = [orgId];
  if (ownerId) {
    clauses.push("ct.owner_id = ?");
    params.push(ownerId);
  }
  const rows = await db
    .prepare(
      `SELECT ct.*, co.name as company_name,
              (SELECT COUNT(*) FROM deals d WHERE d.contact_id = ct.id) as deal_count
       FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY ct.created_at ASC`
    )
    .all(...params);
  const contacts = (rows as any[]).map(toContact);

  const byEmail = new Map<string, Contact[]>();
  const byPhone = new Map<string, Contact[]>();
  for (const c of contacts) {
    const em = normalizeEmail(c.email);
    if (em) {
      if (!byEmail.has(em)) byEmail.set(em, []);
      byEmail.get(em)!.push(c);
    }
    const ph = normalizePhone(c.phone);
    if (ph) {
      if (!byPhone.has(ph)) byPhone.set(ph, []);
      byPhone.get(ph)!.push(c);
    }
  }

  const groups: DuplicateContactGroup[] = [];
  for (const [key, list] of byEmail) if (list.length > 1) groups.push({ key, matchType: "email", contacts: list });
  for (const [key, list] of byPhone) if (list.length > 1) groups.push({ key, matchType: "phone", contacts: list });
  // Most-duplicated / oldest first — whichever has the longest history is
  // the one most worth cleaning up first.
  groups.sort((a, b) => b.contacts.length - a.contacts.length);
  return groups;
}

/** Folds `duplicateIds` into `primaryId`: every deal, activity, task,
 * meeting, reminder and photo attachment that pointed at one of the
 * duplicates now points at the primary instead (merging consolidates history — unlike
 * deleteContacts, which deliberately orphans those rows), the primary picks
 * up any field it was missing (email/phone/company/address) from whichever
 * duplicate had it, and the duplicate contact rows are deleted. No-op if
 * `duplicateIds` is empty or only contains `primaryId` itself. */
export async function mergeContacts(orgId: string, primaryId: string, duplicateIds: string[]): Promise<void> {
  const ids = Array.from(new Set(duplicateIds.filter((dupId) => dupId && dupId !== primaryId)));
  if (ids.length === 0) return;

  const primary = await getContact(orgId, primaryId);
  if (!primary) return;

  const patch: Record<string, string> = {};
  for (const dupId of ids) {
    const dup = await getContact(orgId, dupId);
    if (!dup) continue;
    if (!primary.email && !patch.email && dup.email) patch.email = dup.email;
    if (!primary.phone && !patch.phone && dup.phone) patch.phone = dup.phone;
    if (!primary.companyId && !patch.company_id && dup.companyId) patch.company_id = dup.companyId;
    if (!primary.address && !patch.address && dup.address) patch.address = dup.address;
  }
  if (Object.keys(patch).length > 0) {
    const sets = Object.keys(patch)
      .map((k) => `${k} = ?`)
      .join(", ");
    await db.prepare(`UPDATE contacts SET ${sets} WHERE org_id = ? AND id = ?`).run(...Object.values(patch), orgId, primaryId);
  }

  for (const table of ["deals", "activities", "tasks", "meetings", "custom_alerts", "attachments"]) {
    await db.prepare(`UPDATE ${table} SET contact_id = ? WHERE org_id = ? AND contact_id = ANY(?::text[])`).run(primaryId, orgId, ids);
  }
  await db.prepare("DELETE FROM contacts WHERE org_id = ? AND id = ANY(?::text[])").run(orgId, ids);
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
  address?: string | null;
};

export async function createContact(orgId: string, input: NewContactInput): Promise<Contact> {
  const cid = newId();
  const companyId = await getOrCreateCompany(orgId, input.companyName);
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at, address)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
      createdAt,
      input.address?.trim() || null
    );
  return (await getContact(orgId, cid))!;
}

/** Bulk-imports contacts (from a parsed .vcf file, the native phone Contact
 * Picker, or anywhere else contacts come in in bulk).
 *
 * Duplicates are caught by NORMALIZED phone/email (see normalizeEmail /
 * normalizePhone in domain.ts), not a raw exact-string match — "Mario@x.com"
 * vs "mario@x.com", or "+39 333 1234567" vs "3331234567", are the same
 * person. This is what makes "just re-export your whole phone's address
 * book and re-upload it" a safe habit rather than a duplicate-generating
 * one: every contact already in Pearl is recognized and skipped, however
 * many times the same export gets re-imported, by whoever on the team does
 * it and on whatever phone/platform they're on — there's no per-provider
 * sync to set up, which is also why this is the path Pearl uses instead of
 * a Google/Outlook/iCloud-specific contacts sync (see the "squadra"
 * decision this was built for: it has to work the same way for everyone,
 * regardless of which ecosystem their phone's address book lives in).
 *
 * The existing-contacts lookup is loaded ONCE up front (not per row) and
 * updated in memory as rows are imported, so two matching entries in the
 * SAME import batch (e.g. the same person scanned twice at one event) are
 * also caught, not just matches against what was already in Pearl. */
export async function importContacts(orgId: string, contacts: NewContactInput[]): Promise<{ imported: number; skipped: number }> {
  const existing = (await db.prepare("SELECT email, phone FROM contacts WHERE org_id = ?").all(orgId)) as {
    email: string | null;
    phone: string | null;
  }[];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  for (const row of existing) {
    const em = normalizeEmail(row.email);
    if (em) seenEmails.add(em);
    const ph = normalizePhone(row.phone);
    if (ph) seenPhones.add(ph);
  }

  let imported = 0;
  let skipped = 0;
  for (const c of contacts) {
    if (!c.name?.trim()) {
      skipped++;
      continue;
    }
    const em = normalizeEmail(c.email);
    const ph = normalizePhone(c.phone);
    if (em || ph) {
      const dup = (em && seenEmails.has(em)) || (ph && seenPhones.has(ph));
      if (dup) {
        skipped++;
        continue;
      }
    }
    await createContact(orgId, { ...c, source: c.source || "import" });
    imported++;
    if (em) seenEmails.add(em);
    if (ph) seenPhones.add(ph);
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

/** `viewerOwnerId`: same restriction as listContacts/listDeals — a SALES
 * teammate sees only tasks assigned to them. */
export async function listTasks(orgId: string, opts: { onlyOpen?: boolean; viewerOwnerId?: string } = {}): Promise<TaskRow[]> {
  const clauses = ["t.org_id = ?"];
  const params: any[] = [orgId];
  if (opts.onlyOpen) clauses.push("t.done = 0");
  if (opts.viewerOwnerId) {
    clauses.push("t.owner_id = ?");
    params.push(opts.viewerOwnerId);
  }
  const rows = await db
    .prepare(
      `SELECT t.*, c.name as contact_name, d.title as deal_title
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       LEFT JOIN deals d ON d.id = t.deal_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY t.due_date ASC`
    )
    .all(...params);
  return rows.map(toTask);
}

export type NewTaskInput = {
  title: string;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high";
  contactId?: string | null;
  dealId?: string | null;
  ownerId?: string | null;
};

/** Standalone task creation (the quick-add "+" menu) — separate from the
 * next-step tasks auto-generated from an AI meeting summary, but the same
 * `tasks` table and shape, so both show up together everywhere tasks do. */
export async function createTask(orgId: string, input: NewTaskInput): Promise<TaskRow> {
  const taskId = newId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(taskId, orgId, input.contactId || null, input.dealId || null, input.title.trim(), input.dueDate || null, 0, input.priority || "medium", input.ownerId || null, createdAt);
  const rows = await db
    .prepare(
      `SELECT t.*, c.name as contact_name, d.title as deal_title
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       LEFT JOIN deals d ON d.id = t.deal_id
       WHERE t.org_id = ? AND t.id = ?`
    )
    .get(orgId, taskId);
  return toTask(rows);
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
    locationType: r.location_type ?? null,
    locationDetail: r.location_detail ?? null,
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

/* ---------------------------------------------------------------------- *
 * Per-USER integrations (Gmail/Outlook, one connection per teammate) — see
 * `user_integrations` in src/lib/db.ts. Mirrors the org-wide functions right
 * above, but keyed by (user_id, provider) instead of (org_id, provider), so
 * two teammates in the same org can each connect their own mailbox/calendar
 * independently. WhatsApp deliberately stays on the org-wide table above —
 * one shared company WhatsApp Business number, not a per-person thing.
 * ---------------------------------------------------------------------- */

export async function listUserIntegrations(userId: string) {
  return (await db.prepare("SELECT * FROM user_integrations WHERE user_id = ?").all(userId)) as {
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

export async function getUserIntegration(userId: string, provider: string) {
  return (await db.prepare("SELECT * FROM user_integrations WHERE user_id = ? AND provider = ?").get(userId, provider)) as
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

export async function saveUserIntegrationCredentials(
  orgId: string,
  userId: string,
  provider: string,
  creds: { accessToken?: string; refreshToken?: string; tokenExpiry?: string; extra?: Record<string, unknown> }
): Promise<void> {
  const existing = (await db
    .prepare("SELECT id FROM user_integrations WHERE user_id = ? AND provider = ?")
    .get(userId, provider)) as { id: string } | undefined;
  const extraJson = creds.extra ? JSON.stringify(creds.extra) : null;
  if (existing) {
    await db
      .prepare(
        "UPDATE user_integrations SET connected = 1, connected_at = ?, access_token = COALESCE(?, access_token), refresh_token = COALESCE(?, refresh_token), token_expiry = ?, extra = COALESCE(?, extra) WHERE id = ?"
      )
      .run(new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson, existing.id);
  } else {
    await db
      .prepare(
        "INSERT INTO user_integrations (id, org_id, user_id, provider, connected, connected_at, access_token, refresh_token, token_expiry, extra) VALUES (?,?,?,?,1,?,?,?,?,?)"
      )
      .run(newId(), orgId, userId, provider, new Date().toISOString(), creds.accessToken ?? null, creds.refreshToken ?? null, creds.tokenExpiry ?? null, extraJson);
  }
}

export async function disconnectUserIntegration(userId: string, provider: string): Promise<void> {
  await db
    .prepare(
      "UPDATE user_integrations SET connected = 0, connected_at = NULL, access_token = NULL, refresh_token = NULL, token_expiry = NULL, extra = NULL WHERE user_id = ? AND provider = ?"
    )
    .run(userId, provider);
}

/* ---------------------------------------------------------------------- *
 * Team members — Settings -> Team. An org starts with the one ADMIN user
 * created at signup; the ADMIN can add teammates ("SALES" role) from there.
 * A SALES teammate gets their own login, own connected mailbox/calendar
 * (see user_integrations above), and only ever sees contacts/deals/tasks
 * they own (see the `viewerOwnerId` parameter threaded through listContacts/
 * listDeals/listTasks/dashboardStats above) — an ADMIN always sees everyone's.
 * ---------------------------------------------------------------------- */

export type TeamRole = "ADMIN" | "SALES";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  createdAt: string;
  deactivatedAt: string | null;
};

function toTeamMember(r: { id: string; name: string; email: string; role: string; created_at: string; deactivated_at?: string | null }): TeamMember {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: (r.role as TeamRole) || "SALES",
    createdAt: r.created_at,
    deactivatedAt: r.deactivated_at ?? null,
  };
}

export async function listOrgUsers(orgId: string): Promise<TeamMember[]> {
  const rows = (await db
    .prepare("SELECT id, name, email, role, created_at, deactivated_at FROM users WHERE org_id = ? ORDER BY created_at ASC")
    .all(orgId)) as { id: string; name: string; email: string; role: string; created_at: string; deactivated_at: string | null }[];
  return rows.map(toTeamMember);
}

export async function getUserById(userId: string): Promise<TeamMember | null> {
  const r = (await db.prepare("SELECT id, name, email, role, created_at, deactivated_at FROM users WHERE id = ?").get(userId)) as
    | { id: string; name: string; email: string; role: string; created_at: string; deactivated_at: string | null }
    | undefined;
  return r ? toTeamMember(r) : null;
}

export class EmailAlreadyExistsError extends Error {}

/** Creates a teammate under the SAME org — used by Settings -> Team, ADMIN
 * only (enforced by the caller route, not here). The ADMIN sets the initial
 * password directly (there's no outbound-invite-email flow yet); the
 * teammate can be told to change it after first login. */
export async function createTeamMember(
  orgId: string,
  input: { name: string; email: string; password: string; role: TeamRole }
): Promise<TeamMember> {
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(input.email.trim().toLowerCase());
  if (existing) throw new EmailAlreadyExistsError("An account with this email already exists.");
  const userId = newId();
  const createdAt = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(input.password, 10);
  await db
    .prepare("INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(userId, orgId, input.name.trim(), input.email.trim().toLowerCase(), passwordHash, input.role, createdAt);
  return { id: userId, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, createdAt, deactivatedAt: null };
}

export async function updateTeamMemberRole(orgId: string, userId: string, role: TeamRole): Promise<void> {
  await db.prepare("UPDATE users SET role = ? WHERE org_id = ? AND id = ?").run(role, orgId, userId);
}

/** Blocks a teammate's login without touching their past contacts/deals/
 * tasks (deleting the user row outright would either orphan or cascade-wipe
 * everything they ever owned, via the owner_id foreign key — this avoids
 * that entirely, like disabling a departed employee's badge rather than
 * shredding their old paperwork). An ADMIN still sees everything regardless
 * of who owns it, so nothing disappears from the org's pipeline. */
export async function deactivateTeamMember(orgId: string, userId: string): Promise<void> {
  await db.prepare("UPDATE users SET deactivated_at = ? WHERE org_id = ? AND id = ?").run(new Date().toISOString(), orgId, userId);
}

export async function reactivateTeamMember(orgId: string, userId: string): Promise<void> {
  await db.prepare("UPDATE users SET deactivated_at = NULL WHERE org_id = ? AND id = ?").run(orgId, userId);
}

/* ---------------------------------------------------------------------- *
 * Per-user UI preferences — language and which Statistics widgets show.
 * Deliberately per-user (not per-org): two teammates on the same account
 * can each pick their own language and their own widget layout.
 * ---------------------------------------------------------------------- */

export type UserPreferences = { locale: string | null; statisticsWidgets: string[] | null };

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const r = (await db.prepare("SELECT locale, statistics_widgets FROM users WHERE id = ?").get(userId)) as
    | { locale: string | null; statistics_widgets: string | null }
    | undefined;
  return {
    locale: r?.locale ?? null,
    statisticsWidgets: r?.statistics_widgets ? JSON.parse(r.statistics_widgets) : null,
  };
}

export async function setUserLocale(userId: string, locale: string): Promise<void> {
  await db.prepare("UPDATE users SET locale = ? WHERE id = ?").run(locale, userId);
}

export async function setUserStatisticsWidgets(userId: string, widgetIds: string[]): Promise<void> {
  await db.prepare("UPDATE users SET statistics_widgets = ? WHERE id = ?").run(JSON.stringify(widgetIds), userId);
}

/* ---------------------------------------------------------------------- *
 * Password reset — self-service, email-based (see password_reset_tokens in
 * src/lib/db.ts and sendPasswordResetEmail in src/lib/notify.ts). Used by
 * /forgot-password and /reset-password, and by the /api/auth/* routes
 * behind them.
 * ---------------------------------------------------------------------- */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function findUserByEmail(email: string): Promise<{ id: string; name: string; deactivatedAt: string | null } | null> {
  const r = (await db.prepare("SELECT id, name, deactivated_at FROM users WHERE email = ?").get(email.trim().toLowerCase())) as
    | { id: string; name: string; deactivated_at: string | null }
    | undefined;
  return r ? { id: r.id, name: r.name, deactivatedAt: r.deactivated_at } : null;
}

/** Generates a fresh reset link's token, stores only its hash (see
 * hashResetToken), and returns the RAW token — the only place the raw value
 * ever exists outside the emailed link itself. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await db
    .prepare("INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)")
    .run(newId(), userId, hashResetToken(rawToken), expiresAt, new Date().toISOString());
  return rawToken;
}

/** Validates a raw token from a reset link (unexpired, not already used),
 * sets the new password, and marks the token consumed so the same link
 * can't be replayed. Returns false (and changes nothing) if the token is
 * invalid, expired, or already used. */
export async function consumePasswordResetToken(rawToken: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashResetToken(rawToken);
  const row = (await db
    .prepare("SELECT id, user_id, expires_at, consumed_at FROM password_reset_tokens WHERE token_hash = ?")
    .get(tokenHash)) as { id: string; user_id: string; expires_at: string; consumed_at: string | null } | undefined;
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) return false;

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
  await db.prepare("UPDATE password_reset_tokens SET consumed_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return true;
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
  /** 'AED' | 'EUR', or null before the first successful Stripe Checkout —
   * see CurrencyId in domain.ts and applyStripeSubscription below. */
  billing_currency: string | null;
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
    /** Optional so the narrower {@link applyFeaturedSubscription} call shape
     * (which never sets this) still satisfies this type. */
    currencyId?: string | null;
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
       stripe_cancel_at_period_end = ?,
       billing_currency = COALESCE(?, billing_currency)
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
      sub.currencyId ?? null,
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
export async function listAlerts(orgId: string, viewerOwnerId?: string) {
  const deals = await listDeals(orgId, viewerOwnerId);
  return deals
    .filter((d) => !d.stage.startsWith("closed"))
    .map((d) => ({ deal: d, score: urgencyScore(d) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type WeeklyPlanItem = {
  dealId: string;
  contactId: string | null;
  contactName: string;
  dealTitle: string;
  value: number;
  score: number;
  level: ReturnType<typeof urgencyLevel>;
  address: string | null;
  area: string;
};

export type WeeklyPlanDay = {
  label: (typeof WEEKDAY_LABELS)[number];
  areas: string[];
  items: WeeklyPlanItem[];
  totalScore: number;
};

/**
 * "Plan my week" — suggests which day to visit which contact this week,
 * combining commercial priority (the same urgencyScore that drives
 * "Reactivate today") with geographic proximity. There's no paid
 * routing/geocoding API wired up (see addressArea in domain.ts), so
 * "proximity" here is a free heuristic: contacts whose stored address
 * shares the same city/area are grouped and visited on the same day,
 * never split across days. Days are then filled greedily (always adding
 * a whole area-group to the day with the least total priority so far),
 * so the busiest/most urgent areas land early in the week without any
 * one day being overloaded.
 *
 * Deals whose contact has no stored address can't be placed on the map,
 * so they're returned separately as `unscheduled` — still sorted by
 * priority, with a nudge to add an address so they join the plan.
 */
export async function planWeek(orgId: string, viewerOwnerId?: string): Promise<{ days: WeeklyPlanDay[]; unscheduled: WeeklyPlanItem[] }> {
  const alerts = await listAlerts(orgId, viewerOwnerId);

  const items: WeeklyPlanItem[] = alerts.map(({ deal, score }) => ({
    dealId: deal.id,
    contactId: deal.contactId,
    contactName: deal.contactName || "Unnamed contact",
    dealTitle: deal.title,
    value: deal.value,
    score,
    level: urgencyLevel(score),
    address: deal.contactAddress ?? null,
    area: addressArea(deal.contactAddress) || "",
  }));

  const unscheduled = items.filter((it) => !it.area);
  const placeable = items.filter((it) => it.area);

  // Group by area (case-insensitive), keep each group's total priority.
  const groups = new Map<string, { area: string; items: WeeklyPlanItem[]; totalScore: number }>();
  for (const it of placeable) {
    const key = it.area.toLowerCase();
    const g = groups.get(key) || { area: it.area, items: [], totalScore: 0 };
    g.items.push(it);
    g.totalScore += it.score;
    groups.set(key, g);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => b.totalScore - a.totalScore);

  const days: WeeklyPlanDay[] = WEEKDAY_LABELS.map((label) => ({ label, areas: [], items: [], totalScore: 0 }));
  for (const group of sortedGroups) {
    // Greedy bin-packing: always add the next area-group (whole, never
    // split) to whichever day currently has the least total priority —
    // this is what lets urgent areas land on Monday while keeping every
    // day's workload roughly balanced once there are more areas than days.
    const day = days.reduce((min, d) => (d.totalScore < min.totalScore ? d : min), days[0]);
    day.items.push(...group.items.sort((a, b) => b.score - a.score));
    day.totalScore += group.totalScore;
    day.areas.push(group.area);
  }

  return { days, unscheduled: unscheduled.sort((a, b) => b.score - a.score) };
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

/** Owner Dashboard manual override — clears an org's locked-in billing
 * currency, so it goes back to following the admin's saved language (see
 * resolveUserLocale usage in the billing/signup pages) instead of staying
 * fixed to whatever it was last billed in. This exists for the handful of
 * orgs where "once billed, always that currency" (the rule that protects a
 * real paying customer from their price list silently flipping) is the
 * wrong behavior — the clearest case being the shared Pearl demo account:
 * it was billed once in AED during testing, which then locked AED even
 * after switching the account to Italian to show a prospect EUR pricing.
 * Safe to use on a real paying customer too (their NEXT checkout just picks
 * the currency fresh from their language again), but it's meant for
 * exactly this kind of one-off correction, not routine use. */
export async function resetOrgBillingCurrency(orgId: string): Promise<void> {
  await db.prepare("UPDATE organizations SET billing_currency = NULL WHERE id = ?").run(orgId);
}

// ---- Attachments (site-inspection photos + AI-transcribed handwritten
// notes, on a contact, deal or meeting) --------------------------------

export type AttachmentKind = "photo" | "note";
export type AttachmentTranscriptionStatus = "none" | "processing" | "done" | "failed";

export type Attachment = {
  id: string;
  orgId: string;
  contactId: string | null;
  dealId: string | null;
  meetingId: string | null;
  kind: AttachmentKind;
  fileName: string | null;
  mimeType: string;
  dataBase64: string;
  caption: string | null;
  transcription: string | null;
  transcriptionStatus: AttachmentTranscriptionStatus;
  uploadedBy: string | null;
  createdAt: string;
};

function toAttachment(r: any): Attachment {
  return {
    id: r.id,
    orgId: r.org_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    meetingId: r.meeting_id,
    kind: r.kind,
    fileName: r.file_name,
    mimeType: r.mime_type,
    dataBase64: r.data_base64,
    caption: r.caption,
    transcription: r.transcription,
    transcriptionStatus: r.transcription_status,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

export type NewAttachmentInput = {
  contactId?: string | null;
  dealId?: string | null;
  meetingId?: string | null;
  kind: AttachmentKind;
  fileName?: string | null;
  mimeType: string;
  dataBase64: string;
  caption?: string | null;
  uploadedBy?: string | null;
};

/** Exactly one of contactId/dealId/meetingId should be set — enforced at the
 * database level too (see the CHECK constraint on `attachments` in db.ts),
 * so a bug here fails loudly instead of silently writing an orphaned row. */
export async function createAttachment(orgId: string, input: NewAttachmentInput): Promise<Attachment> {
  const attachmentId = newId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO attachments (id, org_id, contact_id, deal_id, meeting_id, kind, file_name, mime_type, data_base64, caption, transcription, transcription_status, uploaded_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      attachmentId,
      orgId,
      input.contactId || null,
      input.dealId || null,
      input.meetingId || null,
      input.kind,
      input.fileName || null,
      input.mimeType,
      input.dataBase64,
      input.caption?.trim() || null,
      null,
      "none",
      input.uploadedBy || null,
      createdAt
    );
  return (await getAttachment(orgId, attachmentId))!;
}

export async function getAttachment(orgId: string, attachmentId: string): Promise<Attachment | null> {
  const r = await db.prepare("SELECT * FROM attachments WHERE org_id = ? AND id = ?").get(orgId, attachmentId);
  return r ? toAttachment(r) : null;
}

/** Pass exactly one of contactId/dealId/meetingId — the caller (the
 * /api/attachments route) already enforces that and checks the viewer can
 * actually see that entity before calling this. */
export async function listAttachments(
  orgId: string,
  filter: { contactId?: string; dealId?: string; meetingId?: string }
): Promise<Attachment[]> {
  const clauses = ["org_id = ?"];
  const params: any[] = [orgId];
  if (filter.contactId) {
    clauses.push("contact_id = ?");
    params.push(filter.contactId);
  }
  if (filter.dealId) {
    clauses.push("deal_id = ?");
    params.push(filter.dealId);
  }
  if (filter.meetingId) {
    clauses.push("meeting_id = ?");
    params.push(filter.meetingId);
  }
  const rows = await db.prepare(`SELECT * FROM attachments WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`).all(...params);
  return rows.map(toAttachment);
}

export async function updateAttachmentTranscription(
  orgId: string,
  attachmentId: string,
  status: AttachmentTranscriptionStatus,
  text: string | null
): Promise<void> {
  await db
    .prepare("UPDATE attachments SET transcription = ?, transcription_status = ? WHERE org_id = ? AND id = ?")
    .run(text, status, orgId, attachmentId);
}

export async function setAttachmentCaption(orgId: string, attachmentId: string, caption: string | null): Promise<void> {
  await db.prepare("UPDATE attachments SET caption = ? WHERE org_id = ? AND id = ?").run(caption?.trim() || null, orgId, attachmentId);
}

export async function deleteAttachment(orgId: string, attachmentId: string): Promise<void> {
  await db.prepare("DELETE FROM attachments WHERE org_id = ? AND id = ?").run(orgId, attachmentId);
}

export type PromoCode = {
  id: string;
  code: string;
  bonusDays: number;
  note: string | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  active: boolean;
  createdAt: string;
};

function toPromoCode(r: any): PromoCode {
  return {
    id: r.id,
    code: r.code,
    bonusDays: r.bonus_days,
    note: r.note,
    maxRedemptions: r.max_redemptions,
    redemptionsCount: r.redemptions_count,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const rows = await db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC").all();
  return (rows as any[]).map(toPromoCode);
}

/** `code` is normalized upper-case so "paola4" and "PAOLA4" are the same
 * code — matches how {@link redeemPromoCode} looks it up. */
export async function createPromoCode(input: { code: string; bonusDays: number; note?: string | null; maxRedemptions?: number | null }): Promise<void> {
  await db
    .prepare("INSERT INTO promo_codes (id, code, bonus_days, note, max_redemptions, redemptions_count, active, created_at) VALUES (?,?,?,?,?,0,1,?)")
    .run(newId(), input.code.trim().toUpperCase(), input.bonusDays, input.note?.trim() || null, input.maxRedemptions ?? null, new Date().toISOString());
}

export async function setPromoCodeActive(codeId: string, active: boolean): Promise<void> {
  await db.prepare("UPDATE promo_codes SET active = ? WHERE id = ?").run(active ? 1 : 0, codeId);
}

/** Validates a promo code and — if it's still usable — atomically counts the
 * redemption, in one UPDATE guarded by the same WHERE clause that did the
 * validating, so two signups racing on the last remaining use can't both
 * succeed. Returns the bonus days to grant, or null if the code doesn't
 * exist, is disabled, or has no redemptions left. Doesn't touch the
 * organization — see the card-less signup branch in the signup route for
 * what happens with the returned days. */
export async function redeemPromoCode(rawCode: string): Promise<{ bonusDays: number } | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const row = (await db
    .prepare(
      `UPDATE promo_codes SET redemptions_count = redemptions_count + 1
       WHERE code = ? AND active = 1 AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
       RETURNING bonus_days`
    )
    .get(code)) as { bonus_days: number } | undefined;
  return row ? { bonusDays: row.bonus_days } : null;
}

/** `viewerOwnerId`: a SALES teammate gets their own pipeline numbers only;
 * an ADMIN (or an org with no teammates added yet) gets the whole org's,
 * same as before this parameter existed. Custom alerts stay team-wide (they
 * have no owner_id — they're shared reminders, not assigned to one person). */
export async function dashboardStats(orgId: string, viewerOwnerId?: string) {
  const deals = await listDeals(orgId, viewerOwnerId);
  const open = deals.filter((d) => !d.stage.startsWith("closed"));
  const won = deals.filter((d) => d.stage === "closed_won");
  const lost = deals.filter((d) => d.stage === "closed_lost");
  const pipelineValue = open.reduce((s, d) => s + d.value, 0);
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const conversionRate = deals.length > 0 ? Math.round((won.length / (won.length + lost.length || 1)) * 100) : 0;
  const openAlerts = await listCustomAlerts(orgId, { onlyOpen: true });
  const dueCustomAlerts = openAlerts.filter((a) => new Date(a.remindAt).getTime() <= Date.now());
  const dealsAtRisk = (await listAlerts(orgId, viewerOwnerId)).slice(0, 5);
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
