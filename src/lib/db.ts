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
    .run(userId, orgId, "Federica Camurri", "demo@pearlcrm.ae", bcrypt.hashSync("demo1234", 10), "ADMIN", now());

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
  console.log("[ahead-pearl] Demo data seeded. Login: demo@pearlcrm.ae / demo1234");
}
