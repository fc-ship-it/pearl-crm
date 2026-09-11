// Persistence layer backed by real Postgres (e.g. Neon) via `pg`.
//
// This used to be Node's built-in `node:sqlite`, writing to a file. That
// worked locally but was broken in production: on Netlify (and most
// serverless hosts) the only writable path is /tmp, and /tmp is NOT shared
// between function instances — different requests can land on different
// instances, each with its own empty or stale copy of the "database" file.
// In practice that meant signups, logins, imported contacts etc. could
// silently vanish depending on which instance handled the next request.
//
// Postgres fixes this by being a real network database: every instance talks
// to the same server, so data written by one request is visible to the next
// regardless of which instance handles it. Set DATABASE_URL (a Postgres
// connection string — e.g. from Neon, Supabase, or any Postgres host) in the
// environment; see README.md → "Database" for setup instructions.
//
// The `db.prepare(sql).get/.all/.run(...)` shape below is kept identical to
// the old sqlite API on purpose — it's what every call site in this codebase
// already uses — except every method is now async (network I/O can't be
// synchronous), so call sites use `await`. SQL text still uses `?`
// placeholders like sqlite; they're translated to Postgres's `$1, $2, ...`
// automatically.

import { Pool, type QueryResultRow } from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly and immediately rather than limping along with an
  // undefined pool that would throw a cryptic error on the first query —
  // every environment (local dev, Netlify) must set this.
  throw new Error(
    "DATABASE_URL is not set. Pearl needs a Postgres connection string (e.g. from Neon) — see README.md → \"Database\"."
  );
}

// Local Postgres (no TLS) vs. hosted providers like Neon (require TLS) both
// need to work: only send `ssl` when the connection string isn't pointing at
// localhost, since requesting SSL against a local dev Postgres fails.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

declare global {
  // eslint-disable-next-line no-var
  var __pearlPool: Pool | undefined;
}

// Reused across hot invocations of the same warm serverless instance (and
// across Next.js dev-server hot reloads) so we don't leak connections — a
// fresh `new Pool()` per request would exhaust Postgres's connection limit
// under any real load. `max: 3` keeps each function instance's footprint
// small since serverless can run many instances concurrently.
const pool: Pool =
  globalThis.__pearlPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 3,
  });
globalThis.__pearlPool = pool;

function toPgSql(sql: string): string {
  let i = 0;
  // sqlite-style positional `?` -> Postgres-style `$1, $2, ...`. Simple and
  // safe here because none of this codebase's SQL contains a literal `?`
  // character inside a string/quote.
  return sql.replace(/\?/g, () => `$${++i}`);
}

class Statement {
  // `skipReadyGate` is only used internally by seedDemoData below, which
  // runs DURING initDb() itself — awaiting `ready()` there would deadlock
  // (it would be waiting on the very initialization it's part of). Every
  // other caller (all of src/lib/data.ts and the API routes) goes through
  // the normal gated path.
  constructor(private sqlText: string, private skipReadyGate = false) {}

  async run(...params: unknown[]): Promise<{ changes: number }> {
    if (!this.skipReadyGate) await ready();
    const r = await pool.query(toPgSql(this.sqlText), params);
    return { changes: r.rowCount ?? 0 };
  }

  async get<T extends QueryResultRow = any>(...params: unknown[]): Promise<T | undefined> {
    if (!this.skipReadyGate) await ready();
    const r = await pool.query<T>(toPgSql(this.sqlText), params);
    return r.rows[0];
  }

  async all<T extends QueryResultRow = any>(...params: unknown[]): Promise<T[]> {
    if (!this.skipReadyGate) await ready();
    const r = await pool.query<T>(toPgSql(this.sqlText), params);
    return r.rows;
  }
}

export const db = {
  prepare(sqlText: string): Statement {
    return new Statement(sqlText);
  },
  async exec(sqlText: string): Promise<void> {
    await pool.query(sqlText);
  },
};

/** Used only inside this file's own seedDemoData (which runs as part of
 * initDb itself) to avoid the ready()-awaits-itself deadlock described
 * above. Not exported — nothing outside this file should ever bypass the
 * ready() gate. */
function rawPrepare(sqlText: string): Statement {
  return new Statement(sqlText, true);
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TEXT NOT NULL,
  promo_bonus_days INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sector TEXT,
  website TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  company_id TEXT REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  interest TEXT,
  budget_tier TEXT,
  target_segment TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  owner_id TEXT REFERENCES users(id),
  temperature TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  segment_interest TEXT,
  segment_budget_tier TEXT,
  segment_target_segment TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_alerts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'general',
  contact_id TEXT REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  company_id TEXT REFERENCES companies(id),
  title TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'lead',
  probability INTEGER NOT NULL DEFAULT 20,
  owner_id TEXT REFERENCES users(id),
  expected_close_date TEXT,
  last_interaction_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  title TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  owner_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  transcript TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0,
  connected_at TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TEXT,
  extra TEXT,
  UNIQUE(org_id, provider)
);
`;

async function columnsOf(table: string): Promise<string[]> {
  const r = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return r.rows.map((row) => row.column_name);
}

async function addMissingColumns(table: string, wanted: Array<[string, string]>): Promise<void> {
  const cols = await columnsOf(table);
  for (const [name, ddl] of wanted) {
    if (!cols.includes(name)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl};`);
  }
}

// Module-level async init, run exactly once per warm process (dev server or
// serverless instance) and awaited by every caller via `ready` below before
// touching the database — Postgres schema setup is inherently async, unlike
// the old synchronous sqlite version, so every consumer needs to wait for it
// at least once.
let initPromise: Promise<void> | null = null;

async function initDb(): Promise<void> {
  await pool.query(SCHEMA);

  // ---- lightweight migration guards -------------------------------------
  // Add columns to a database created before a given feature shipped, so an
  // existing Postgres database doesn't need to be recreated from scratch.
  await addMissingColumns("contacts", [
    ["interest", "TEXT"],
    ["budget_tier", "TEXT"],
    ["target_segment", "TEXT"],
    ["source", "TEXT NOT NULL DEFAULT 'manual'"],
    ["temperature", "TEXT"],
  ]);
  await addMissingColumns("custom_alerts", [
    ["kind", "TEXT NOT NULL DEFAULT 'general'"],
    ["contact_id", "TEXT REFERENCES contacts(id)"],
  ]);
  await addMissingColumns("integrations", [
    ["access_token", "TEXT"],
    ["refresh_token", "TEXT"],
    ["token_expiry", "TEXT"],
    ["extra", "TEXT"],
  ]);
  await addMissingColumns("organizations", [
    ["billing_interval", "TEXT"],
    ["billing_period_end", "TEXT"],
    ["subscription_status", "TEXT NOT NULL DEFAULT 'trialing'"],
    ["grace_until", "TEXT"],
    ["pending_payment_intent_id", "TEXT"],
    ["pending_interval", "TEXT"],
    ["last_applied_payment_intent_id", "TEXT"],
    ["stripe_customer_id", "TEXT"],
    ["stripe_subscription_id", "TEXT"],
    ["stripe_cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0"],
  ]);

  // ---- one-time demo seed ------------------------------------------------
  const { rows } = await pool.query<{ c: string }>("SELECT COUNT(*) as c FROM organizations");
  if (Number(rows[0].c) === 0) {
    await seedDemoData();
  }

  // ---- enrich the demo with more data (hot/cold leads, fuller pipeline) --
  // Runs on every startup but only ever acts once, guarded by the marker
  // row it inserts at the very end — see enrichDemoDataOnce() below.
  await enrichDemoDataOnce();

  // ---- lock down the old, publicly-known demo password -------------------
  // The demo account used to ship with a password shown right on the login
  // page ("Use demo credentials" button), which meant anyone who found the
  // live site could log in as it. That button is gone from the UI now, but
  // a database that was already seeded before this change still has the
  // old password hash sitting in it. This runs on every startup, but only
  // ever *acts* the one time it finds the old hash still in place — once
  // it's swapped to the new password (or Federica changes it herself to
  // something else), bcrypt.compareSync below stops matching and this is a
  // no-op forever after.
  await rotateKnownDemoPassword();
}

const OLD_PUBLIC_DEMO_PASSWORD = "demo1234";
const NEW_DEMO_PASSWORD = "Falco9831#Pearl";

async function rotateKnownDemoPassword(): Promise<void> {
  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    ["demo@pearlcrm.ae"]
  );
  const demoUser = rows[0];
  if (!demoUser) return;
  if (bcrypt.compareSync(OLD_PUBLIC_DEMO_PASSWORD, demoUser.password_hash)) {
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [bcrypt.hashSync(NEW_DEMO_PASSWORD, 10), demoUser.id]);
    // eslint-disable-next-line no-console
    console.log("[ahead-pearl] Rotated demo account password away from the old public default.");
  }
}

/** Every module that touches the database awaits this once before its first
 * query, guaranteeing the schema/migrations/seed above have already run —
 * required now that setup is async (it used to run synchronously at import
 * time with the old sqlite driver). Safe to await repeatedly; the same
 * promise is reused. */
export function ready(): Promise<void> {
  if (!initPromise) initPromise = initDb();
  return initPromise;
}

async function seedDemoData(): Promise<void> {
  const orgId = id();
  const trialEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await rawPrepare("INSERT INTO organizations (id, name, plan, trial_ends_at, promo_bonus_days, created_at) VALUES (?,?,?,?,?,?)")
    .run(orgId, "Pearl Demo", "trial", trialEnds, 0, now());

  const userId = id();
  await rawPrepare("INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(userId, orgId, "Federica Camurri", "demo@pearlcrm.ae", bcrypt.hashSync(NEW_DEMO_PASSWORD, 10), "ADMIN", now());

  const companies = [
    { name: "Azure Bay Hotels Group", sector: "Hospitality", website: "azurebayhotels.ae" },
    { name: "Meridian Precision Engineering", sector: "Manufacturing", website: "meridianprecision.ae" },
    { name: "Al Waha Trading LLC", sector: "Import/Export", website: "alwahatrading.ae" },
    { name: "GreenPack Packaging", sector: "Packaging", website: "greenpack.ae" },
    { name: "Dubai Silicon Ventures", sector: "Tech / Venture", website: "dsventures.ae" },
    { name: "Falcon Industrial Systems", sector: "Industrial Systems", website: "falconindustrial.ae" },
  ];
  const companyIds: string[] = [];
  for (const c of companies) {
    const cid = id();
    await rawPrepare("INSERT INTO companies (id, org_id, name, sector, website, created_at) VALUES (?,?,?,?,?,?)").run(
      cid,
      orgId,
      c.name,
      c.sector,
      c.website,
      now()
    );
    companyIds.push(cid);
  }

  const contactsSeed = [
    { name: "James Carter", email: "j.carter@azurebayhotels.ae", phone: "+971 50 111 2233", company: 0, interest: "Hotel management software", budgetTier: "medium", targetSegment: "Hospitality", source: "manual" },
    { name: "Emily Novak", email: "e.novak@meridianprecision.ae", phone: "+971 55 444 5566", company: 1, interest: "Production automation", budgetTier: "high", targetSegment: "Manufacturing", source: "manual" },
    { name: "Ahmed Al Mansouri", email: "ahmed@alwahatrading.ae", phone: "+971 50 123 4567", company: 2, interest: "Retail expansion", budgetTier: "high", targetSegment: "Retail", source: "import" },
    { name: "Laura Bennett", email: "l.bennett@greenpack.ae", phone: "+971 52 222 8899", company: 3, interest: "Sustainable packaging", budgetTier: "medium", targetSegment: "Manufacturing", source: "import" },
    { name: "Sara Al Qassimi", email: "sara@dsventures.ae", phone: "+971 55 987 6543", company: 4, interest: "Seed investment", budgetTier: "high", targetSegment: "Venture / Tech", source: "manual" },
    { name: "Michael Ferraro", email: "m.ferraro@falconindustrial.ae", phone: "+971 54 777 3344", company: 5, interest: "Facility maintenance", budgetTier: "low", targetSegment: "Industrial", source: "qr" },
    { name: "Olivia Grant", email: "o.grant@azurebayhotels.ae", phone: "+971 56 555 1122", company: 0, interest: "Smart room upgrades", budgetTier: "low", targetSegment: "Hospitality", source: "whatsapp-qr" },
    { name: "Youssef Haddad", email: "youssef@alwahatrading.ae", phone: "+971 52 456 7890", company: 2, interest: "MENA distribution", budgetTier: "high", targetSegment: "Retail", source: "qr" },
  ];
  const contactIds: string[] = [];
  for (const c of contactsSeed) {
    const ctid = id();
    await rawPrepare(
      "INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(ctid, orgId, companyIds[c.company], c.name, c.email, c.phone, "[]", c.interest, c.budgetTier, c.targetSegment, c.source, userId, now());
    contactIds.push(ctid);
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

  const dealsSeed = [
    { title: "Hotel management software rollout", contact: 0, company: 0, value: 68000, stage: "proposal", prob: 55, lastInteraction: 9 },
    { title: "Production line automation", contact: 1, company: 1, value: 155000, stage: "negotiation", prob: 70, lastInteraction: 14 },
    { title: "Dubai Mall retail expansion", contact: 2, company: 2, value: 350000, stage: "qualified", prob: 35, lastInteraction: 21 },
    { title: "Sustainable packaging contract renewal", contact: 3, company: 3, value: 99000, stage: "contacted", prob: 25, lastInteraction: 3 },
    { title: "Seed investment - due diligence", contact: 4, company: 4, value: 920000, stage: "proposal", prob: 45, lastInteraction: 31 },
    { title: "Facility maintenance - annual contract", contact: 5, company: 5, value: 58000, stage: "lead", prob: 15, lastInteraction: 1 },
    { title: "Smart room suite upgrade", contact: 6, company: 0, value: 30000, stage: "closed_won", prob: 100, lastInteraction: 45 },
    { title: "MENA distribution - phase 2", contact: 7, company: 2, value: 225000, stage: "negotiation", prob: 60, lastInteraction: 6 },
  ];
  const dealIds: string[] = [];
  for (const d of dealsSeed) {
    const did = id();
    await rawPrepare(
      "INSERT INTO deals (id, org_id, contact_id, company_id, title, value, stage, probability, owner_id, expected_close_date, last_interaction_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(
        did,
        orgId,
        contactIds[d.contact],
        companyIds[d.company],
        d.title,
        d.value,
        d.stage,
        d.prob,
        userId,
        daysAgo(-20),
        daysAgo(d.lastInteraction),
        daysAgo(d.lastInteraction + 10)
      );
    dealIds.push(did);
  }

  const activityTypes: Array<[string, string]> = [
    ["email", "Email sent: commercial proposal recap"],
    ["call", "Alignment call (15 min)"],
    ["whatsapp", "WhatsApp message: document receipt confirmed"],
    ["meeting", "Meeting at the client's office"],
    ["note", "Internal note: watch Q3 budget under review"],
  ];
  for (let i = 0; i < dealIds.length; i++) {
    const dealId = dealIds[i];
    const contactId = contactIds[dealsSeed[i].contact];
    for (let k = 0; k < 3; k++) {
      const [type, content] = activityTypes[(i + k) % activityTypes.length];
      await rawPrepare(
        "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
      ).run(id(), orgId, contactId, dealId, type, content, daysAgo(dealsSeed[i].lastInteraction + k * 4), now());
    }
  }

  const tasksSeed = [
    { title: "Call James Carter back for proposal follow-up", due: -1, deal: 0, contact: 0, priority: "high" },
    { title: "Send updated price list to Emily Novak", due: 0, deal: 1, contact: 1, priority: "high" },
    { title: "Prepare slides for call with Sara Al Qassimi", due: 1, deal: 4, contact: 4, priority: "medium" },
    { title: "Review contract with legal team", due: 2, deal: 4, contact: 4, priority: "medium" },
    { title: "Follow up after meeting with Michael Ferraro", due: 0, deal: 5, contact: 5, priority: "low" },
  ];
  for (const t of tasksSeed) {
    await rawPrepare(
      "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(id(), orgId, contactIds[t.contact], dealIds[t.deal], t.title, daysAgo(-t.due), 0, t.priority, userId, now());
  }

  const meetingSummary = {
    participants: ["Federica Camurri", "Sara Al Qassimi"],
    keyPoints: [
      "Presented the investment roadmap and seed round structure",
      "Discussed due diligence timeline (4-6 weeks)",
      "Requested additional financial data for the last 2 years",
    ],
    decisions: ["Proceed with an NDA before sharing financial data"],
    objections: ["Valuation considered high compared to market comparables"],
    nextSteps: [
      { action: "Send signed NDA", owner: "Federica Camurri", dueDate: daysAgo(-3) },
      { action: "Collect financial statements for the last 2 years", owner: "Sara Al Qassimi", dueDate: daysAgo(-7) },
    ],
  };
  await rawPrepare(
      "INSERT INTO meetings (id, org_id, contact_id, deal_id, title, date, transcript, summary_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(id(), orgId, contactIds[4], dealIds[4], "Seed investment call - first meeting", daysAgo(5), null, JSON.stringify(meetingSummary), now());

  await rawPrepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)")
    .run(id(), orgId, "gmail", 1, daysAgo(12));
  await rawPrepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)")
    .run(id(), orgId, "calendar", 1, daysAgo(12));
  await rawPrepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)")
    .run(id(), orgId, "whatsapp", 0, null);

  await rawPrepare(
      "INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      id(),
      orgId,
      "Ramadan hospitality offer",
      "Salam! For Ramadan we're offering a 20% discount on annual contracts renewed this month. Reply to this message to lock in your rate.",
      "whatsapp",
      null,
      null,
      "Hospitality",
      "sent",
      2,
      daysAgo(10),
      daysAgo(10)
    );

  await rawPrepare("INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at) VALUES (?,?,?,?,?,?)")
    .run(id(), orgId, "Follow up on Q3 renewal promo with high-budget hospitality accounts", daysAgo(-2), 0, now());

  // eslint-disable-next-line no-console
  console.log("[ahead-pearl] Demo data seeded for demo@pearlcrm.ae (password set in NEW_DEMO_PASSWORD, not printed here).");
}

const DEMO_ENRICHMENT_MARKER_ID = "demo-enrichment-v1";

/**
 * Adds a second wave of demo content on top of whatever seedDemoData
 * produced: more contacts with a real spread of hot/warm/cold lead
 * temperatures, more deals across every pipeline stage (including
 * closed_won/closed_lost, which the original seed never used), more
 * activities/tasks/meetings/campaigns/alerts — so every screen (dashboard,
 * pipeline, contacts, statistics, campaigns) looks like a live, busy CRM
 * instead of a handful of placeholder rows.
 *
 * This runs on every server start (initDb runs on every cold start on
 * Netlify's serverless functions, not just once ever), so it has to be
 * idempotent against a database that's already been through it — that's
 * what DEMO_ENRICHMENT_MARKER_ID is for: a fixed (not random) primary key
 * inserted as the very last step, checked as the very first step.
 */
async function enrichDemoDataOnce(): Promise<void> {
  const marker = await pool.query("SELECT 1 FROM custom_alerts WHERE id = $1", [DEMO_ENRICHMENT_MARKER_ID]);
  if ((marker.rowCount ?? 0) > 0) return;

  const orgRow = await pool.query<{ id: string }>("SELECT id FROM organizations WHERE name = $1 LIMIT 1", ["Pearl Demo"]);
  const orgId = orgRow.rows[0]?.id;
  if (!orgId) return; // not a demo deployment (or the demo org was renamed/deleted) - nothing to enrich

  const userRow = await pool.query<{ id: string }>("SELECT id FROM users WHERE org_id = $1 AND email = $2 LIMIT 1", [orgId, "demo@pearlcrm.ae"]);
  const userId = userRow.rows[0]?.id;
  if (!userId) return;

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

  // Give the original 8 seed contacts a temperature too, so hot/warm/cold
  // isn't only found among the newly-added ones below.
  const existingTemps: Record<string, "hot" | "warm" | "cold"> = {
    "j.carter@azurebayhotels.ae": "warm",
    "e.novak@meridianprecision.ae": "hot",
    "ahmed@alwahatrading.ae": "hot",
    "l.bennett@greenpack.ae": "cold",
    "sara@dsventures.ae": "warm",
    "m.ferraro@falconindustrial.ae": "cold",
    "o.grant@azurebayhotels.ae": "cold",
    "youssef@alwahatrading.ae": "hot",
  };
  for (const [email, temp] of Object.entries(existingTemps)) {
    await pool.query("UPDATE contacts SET temperature = $1 WHERE org_id = $2 AND email = $3", [temp, orgId, email]);
  }

  const newCompanies = [
    { name: "Coral Reef Resorts", sector: "Hospitality", website: "coralreefresorts.ae" },
    { name: "Desert Rose Logistics", sector: "Logistics", website: "desertroselogistics.ae" },
    { name: "BrightPath Education Group", sector: "Education", website: "brightpatheducation.ae" },
    { name: "Lumen Health Clinics", sector: "Healthcare", website: "lumenhealthclinics.ae" },
    { name: "Zenith Real Estate", sector: "Real Estate", website: "zenithrealestate.ae" },
    { name: "Orion FinTech Solutions", sector: "FinTech", website: "orionfintech.ae" },
  ];
  const newCompanyIds: string[] = [];
  for (const c of newCompanies) {
    const cid = id();
    await pool.query("INSERT INTO companies (id, org_id, name, sector, website, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [
      cid,
      orgId,
      c.name,
      c.sector,
      c.website,
      now(),
    ]);
    newCompanyIds.push(cid);
  }

  // The 6 companies from the original seed, looked up by name so this
  // works regardless of when/where seedDemoData ran.
  const existingCompanyNames = [
    "Azure Bay Hotels Group",
    "Meridian Precision Engineering",
    "Al Waha Trading LLC",
    "GreenPack Packaging",
    "Dubai Silicon Ventures",
    "Falcon Industrial Systems",
  ];
  const existingCompanyIds: string[] = [];
  for (const cname of existingCompanyNames) {
    const r = await pool.query<{ id: string }>("SELECT id FROM companies WHERE org_id = $1 AND name = $2 LIMIT 1", [orgId, cname]);
    if (r.rows[0]) existingCompanyIds.push(r.rows[0].id);
  }
  // 0-5 = original companies, 6-11 = the new ones above.
  const companyIds = [...existingCompanyIds, ...newCompanyIds];

  const newContactsSeed: Array<{
    name: string;
    email: string;
    phone: string;
    company: number;
    interest: string;
    budgetTier: string;
    targetSegment: string;
    source: string;
    temperature: "hot" | "warm" | "cold";
  }> = [
    { name: "Layla Haddad", email: "layla@coralreefresorts.ae", phone: "+971 50 234 1122", company: 6, interest: "Guest loyalty program", budgetTier: "high", targetSegment: "Hospitality", source: "manual", temperature: "hot" },
    { name: "Karim El Sayed", email: "karim@desertroselogistics.ae", phone: "+971 55 345 2233", company: 7, interest: "Fleet tracking software", budgetTier: "medium", targetSegment: "Logistics", source: "import", temperature: "warm" },
    { name: "Priya Nair", email: "priya@brightpatheducation.ae", phone: "+971 52 456 3344", company: 8, interest: "LMS deployment", budgetTier: "low", targetSegment: "Education", source: "qr", temperature: "cold" },
    { name: "Daniel Kessler", email: "daniel@lumenhealthclinics.ae", phone: "+971 50 567 4455", company: 9, interest: "Patient CRM rollout", budgetTier: "high", targetSegment: "Healthcare", source: "manual", temperature: "hot" },
    { name: "Fatima Al Zaabi", email: "fatima@zenithrealestate.ae", phone: "+971 55 678 5566", company: 10, interest: "Property portal", budgetTier: "high", targetSegment: "Real Estate", source: "whatsapp-qr", temperature: "warm" },
    { name: "Robert Hayes", email: "robert@orionfintech.ae", phone: "+971 52 789 6677", company: 11, interest: "Compliance automation", budgetTier: "high", targetSegment: "FinTech", source: "import", temperature: "hot" },
    { name: "Noora Al Suwaidi", email: "noora@azurebayhotels.ae", phone: "+971 50 890 7788", company: 0, interest: "Concierge chatbot", budgetTier: "low", targetSegment: "Hospitality", source: "qr", temperature: "cold" },
    { name: "Marco Bellini", email: "marco@meridianprecision.ae", phone: "+971 55 901 8899", company: 1, interest: "Predictive maintenance", budgetTier: "medium", targetSegment: "Manufacturing", source: "manual", temperature: "warm" },
    { name: "Aisha Rahman", email: "aisha@alwahatrading.ae", phone: "+971 52 012 9900", company: 2, interest: "E-commerce platform", budgetTier: "high", targetSegment: "Retail", source: "import", temperature: "hot" },
    { name: "Thomas Becker", email: "thomas@greenpack.ae", phone: "+971 50 123 0011", company: 3, interest: "Recycling tracker", budgetTier: "low", targetSegment: "Manufacturing", source: "qr", temperature: "cold" },
    { name: "Hana Suzuki", email: "hana@dsventures.ae", phone: "+971 55 234 1123", company: 4, interest: "Series A follow-on", budgetTier: "medium", targetSegment: "Venture / Tech", source: "manual", temperature: "warm" },
    { name: "Khalid Bin Ali", email: "khalid@falconindustrial.ae", phone: "+971 52 345 2234", company: 5, interest: "IoT sensors rollout", budgetTier: "high", targetSegment: "Industrial", source: "whatsapp-qr", temperature: "hot" },
    { name: "Elena Petrova", email: "elena@coralreefresorts.ae", phone: "+971 50 456 3345", company: 6, interest: "Spa booking system", budgetTier: "low", targetSegment: "Hospitality", source: "import", temperature: "cold" },
    { name: "Omar Chaudhry", email: "omar@desertroselogistics.ae", phone: "+971 55 567 4456", company: 7, interest: "Warehouse automation", budgetTier: "high", targetSegment: "Logistics", source: "manual", temperature: "hot" },
    { name: "Sofia Marino", email: "sofia@brightpatheducation.ae", phone: "+971 52 678 5567", company: 8, interest: "Parent communication app", budgetTier: "medium", targetSegment: "Education", source: "qr", temperature: "warm" },
    { name: "Rashid Al Falasi", email: "rashid@lumenhealthclinics.ae", phone: "+971 50 789 6678", company: 9, interest: "Telehealth pilot", budgetTier: "low", targetSegment: "Healthcare", source: "import", temperature: "cold" },
    { name: "Grace Mensah", email: "grace@zenithrealestate.ae", phone: "+971 55 890 7789", company: 10, interest: "Virtual tour integration", budgetTier: "high", targetSegment: "Real Estate", source: "manual", temperature: "hot" },
    { name: "Vikram Malhotra", email: "vikram@orionfintech.ae", phone: "+971 52 901 8890", company: 11, interest: "Fraud detection module", budgetTier: "medium", targetSegment: "FinTech", source: "whatsapp-qr", temperature: "warm" },
    { name: "Nadia Kanaan", email: "nadia@azurebayhotels.ae", phone: "+971 50 012 9901", company: 0, interest: "Group booking portal", budgetTier: "high", targetSegment: "Hospitality", source: "import", temperature: "hot" },
    { name: "Chen Wei", email: "chen@meridianprecision.ae", phone: "+971 55 123 0012", company: 1, interest: "Supplier portal", budgetTier: "low", targetSegment: "Manufacturing", source: "qr", temperature: "cold" },
  ];

  const newContactIds: string[] = [];
  for (const c of newContactsSeed) {
    const ctid = id();
    await pool.query(
      `INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at, temperature)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ctid, orgId, companyIds[c.company], c.name, c.email, c.phone, "[]", c.interest, c.budgetTier, c.targetSegment, c.source, userId, now(), c.temperature]
    );
    newContactIds.push(ctid);
  }

  const newDealsSeed = [
    { title: "Guest loyalty program integration", contact: 0, company: 6, value: 45000, stage: "qualified", prob: 40, lastInteraction: 4 },
    { title: "Fleet tracking software", contact: 1, company: 7, value: 120000, stage: "negotiation", prob: 65, lastInteraction: 8 },
    { title: "LMS deployment", contact: 2, company: 8, value: 60000, stage: "lead", prob: 15, lastInteraction: 12 },
    { title: "Patient CRM rollout", contact: 3, company: 9, value: 210000, stage: "proposal", prob: 55, lastInteraction: 5 },
    { title: "Property listing portal", contact: 4, company: 10, value: 88000, stage: "contacted", prob: 25, lastInteraction: 2 },
    { title: "Compliance automation suite", contact: 5, company: 11, value: 340000, stage: "negotiation", prob: 70, lastInteraction: 10 },
    { title: "Concierge chatbot pilot", contact: 6, company: 0, value: 25000, stage: "closed_lost", prob: 0, lastInteraction: 60 },
    { title: "Predictive maintenance platform", contact: 7, company: 1, value: 175000, stage: "qualified", prob: 45, lastInteraction: 7 },
    { title: "E-commerce platform build", contact: 8, company: 2, value: 260000, stage: "proposal", prob: 50, lastInteraction: 15 },
    { title: "Recycling tracker rollout", contact: 9, company: 3, value: 40000, stage: "closed_lost", prob: 0, lastInteraction: 90 },
    { title: "Series A follow-on round", contact: 10, company: 4, value: 500000, stage: "lead", prob: 10, lastInteraction: 3 },
    { title: "IoT sensors rollout - phase 1", contact: 11, company: 5, value: 145000, stage: "closed_won", prob: 100, lastInteraction: 20 },
  ];
  const newDealIds: string[] = [];
  for (const d of newDealsSeed) {
    const did = id();
    await pool.query(
      `INSERT INTO deals (id, org_id, contact_id, company_id, title, value, stage, probability, owner_id, expected_close_date, last_interaction_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [did, orgId, newContactIds[d.contact], companyIds[d.company], d.title, d.value, d.stage, d.prob, userId, daysAgo(-20), daysAgo(d.lastInteraction), daysAgo(d.lastInteraction + 10)]
    );
    newDealIds.push(did);
  }

  const activityTypes: Array<[string, string]> = [
    ["email", "Email sent: commercial proposal recap"],
    ["call", "Alignment call (15 min)"],
    ["whatsapp", "WhatsApp message: document receipt confirmed"],
    ["meeting", "Meeting at the client's office"],
    ["note", "Internal note: watch Q3 budget under review"],
  ];
  for (let i = 0; i < newDealIds.length; i++) {
    const dealId = newDealIds[i];
    const contactId = newContactIds[newDealsSeed[i].contact];
    for (let k = 0; k < 3; k++) {
      const [type, content] = activityTypes[(i + k) % activityTypes.length];
      await pool.query(
        "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [id(), orgId, contactId, dealId, type, content, daysAgo(newDealsSeed[i].lastInteraction + k * 4), now()]
      );
    }
  }

  const newTasksSeed = [
    { title: "Send loyalty program proposal to Layla Haddad", due: -1, deal: 0, contact: 0, priority: "high" },
    { title: "Confirm fleet tracking pilot scope with Karim El Sayed", due: 0, deal: 1, contact: 1, priority: "high" },
    { title: "Share LMS demo recording with Priya Nair", due: 2, deal: 2, contact: 2, priority: "low" },
    { title: "Follow up on patient CRM contract redlines", due: 1, deal: 3, contact: 3, priority: "medium" },
    { title: "Schedule property portal walkthrough", due: 0, deal: 4, contact: 4, priority: "medium" },
    { title: "Prepare compliance automation ROI deck", due: -2, deal: 5, contact: 5, priority: "high" },
    { title: "Send IoT rollout completion report", due: 3, deal: 11, contact: 11, priority: "low" },
  ];
  for (const t of newTasksSeed) {
    await pool.query(
      "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id(), orgId, newContactIds[t.contact], newDealIds[t.deal], t.title, daysAgo(-t.due), 0, t.priority, userId, now()]
    );
  }

  const meetingsSeed = [
    {
      contact: 3,
      deal: 3,
      title: "Patient CRM rollout - discovery call",
      date: daysAgo(6),
      summary: {
        participants: ["Federica Camurri", "Daniel Kessler"],
        keyPoints: [
          "Walked through the current patient intake workflow",
          "Identified 2 clinics as pilot sites",
          "Discussed data-handling requirements for the UAE healthcare market",
        ],
        decisions: ["Move forward with a 2-clinic pilot before full rollout"],
        objections: ["Concerned about staff training time during go-live"],
        nextSteps: [
          { action: "Send pilot scope document", owner: "Federica Camurri", dueDate: daysAgo(-4) },
          { action: "Confirm pilot clinic IT contacts", owner: "Daniel Kessler", dueDate: daysAgo(-6) },
        ],
      },
    },
    {
      contact: 5,
      deal: 5,
      title: "Compliance automation - contract review",
      date: daysAgo(9),
      summary: {
        participants: ["Federica Camurri", "Robert Hayes"],
        keyPoints: [
          "Reviewed integration points with the existing risk engine",
          "Confirmed data residency requirements",
          "Discussed a phased rollout across 3 regional offices",
        ],
        decisions: ["Legal to review the data processing agreement before signature"],
        objections: ["Pricing tier for the highest transaction volume needs revisiting"],
        nextSteps: [
          { action: "Send revised pricing proposal", owner: "Federica Camurri", dueDate: daysAgo(-2) },
          { action: "Loop in legal team", owner: "Robert Hayes", dueDate: daysAgo(-5) },
        ],
      },
    },
  ];
  for (const m of meetingsSeed) {
    await pool.query(
      "INSERT INTO meetings (id, org_id, contact_id, deal_id, title, date, transcript, summary_json, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id(), orgId, newContactIds[m.contact], newDealIds[m.deal], m.title, m.date, null, JSON.stringify(m.summary), now()]
    );
  }

  await pool.query(
    `INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id(),
      orgId,
      "Fintech compliance webinar",
      "You're invited: a 30-minute walkthrough of our compliance automation suite, tailored for UAE fintech firms.",
      "email",
      null,
      "high",
      "FinTech",
      "sent",
      3,
      daysAgo(6),
      daysAgo(6),
    ]
  );
  await pool.query(
    `INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id(), orgId, "Healthcare pilot follow-up", "Checking in on the patient CRM pilot - happy to jump on a call this week if useful.", "whatsapp", null, null, "Healthcare", "draft", 0, now(), null]
  );

  await pool.query("INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at, kind, contact_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id(),
    orgId,
    "Call Robert Hayes about revised pricing",
    daysAgo(-1),
    0,
    now(),
    "call",
    newContactIds[5],
  ]);
  await pool.query("INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at, kind, contact_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id(),
    orgId,
    "On-site walkthrough with Fatima Al Zaabi",
    daysAgo(-3),
    0,
    now(),
    "appointment",
    newContactIds[4],
  ]);

  // Marker row last, with the fixed id checked at the top of this function.
  await pool.query("INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at, kind, contact_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    DEMO_ENRICHMENT_MARKER_ID,
    orgId,
    "[internal] demo data enrichment v1 applied",
    daysAgo(1),
    1,
    now(),
    "general",
    null,
  ]);

  // eslint-disable-next-line no-console
  console.log("[ahead-pearl] Demo data enriched: +6 companies, +20 contacts, +12 deals, +2 meetings, +2 campaigns.");
}
