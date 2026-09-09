// Lightweight persistence layer built on Node's built-in `node:sqlite`.
//
// Why not Prisma / better-sqlite3? Both need to download a native/prebuilt
// binary at install time. In this environment that download is blocked by
// network policy, and more importantly it's one less moving part for a demo
// that needs to run anywhere with zero native build steps. `node:sqlite`
// ships inside Node.js itself (stable-ish since Node 22), so `npm install`
// is 100% pure-JS and `npm run dev` just works.
//
// For a real multi-tenant production deployment, swap this file for a
// Postgres-backed data layer (Prisma + Postgres, or `pg` directly) — the
// schema below is deliberately plain, portable SQL so that move is
// mechanical. See README.md → "Dal MVP alla produzione".

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// On Vercel, Netlify (and most serverless hosts) the project directory is
// read-only — only /tmp is writable, and it isn't guaranteed to persist
// between invocations. That's fine for this SQLite-backed MVP (the demo data
// re-seeds itself on first query, see below), but it means the working
// directory can't be used as the data dir there. Locally (npm run dev /
// npm start) we keep using ./data so the database survives restarts.
//
// We check known env vars for the platforms we've tested (Vercel, Netlify,
// generic AWS Lambda), but platforms occasionally change these, so as a
// safety net we also probe whether the project directory is actually
// writable and fall back to /tmp if it isn't — that way a host we haven't
// explicitly named still doesn't crash the app with an EROFS/EACCES error.
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !canWrite(path.join(process.cwd(), "data"));

function canWrite(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const DATA_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), "pearl-data") : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __pearlDb: DatabaseSync | undefined;
}

function openDb(): DatabaseSync {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  // Next.js builds collect page data across several parallel worker
  // processes; each one imports this module and — on a brand-new database —
  // races to run the one-time demo seed below. Without a busy timeout, a
  // worker that loses that race gets an immediate "database is locked"
  // error instead of simply waiting its turn, which intermittently failed
  // production builds. 5s is comfortably longer than the seed insert takes.
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export const db: DatabaseSync = globalThis.__pearlDb ?? openDb();
if (process.env.NODE_ENV !== "production") globalThis.__pearlDb = db;

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

db.exec(SCHEMA);

// ---- lightweight migration guard --------------------------------------
// Adds new contact columns to a database created before this feature
// shipped, so an existing local data/app.db doesn't need to be deleted.
(function migrateContactColumns() {
  const cols = (db.prepare("PRAGMA table_info(contacts)").all() as { name: string }[]).map((c) => c.name);
  const wanted: Array<[string, string]> = [
    ["interest", "TEXT"],
    ["budget_tier", "TEXT"],
    ["target_segment", "TEXT"],
    ["source", "TEXT NOT NULL DEFAULT 'manual'"],
    ["temperature", "TEXT"],
  ];
  for (const [name, ddl] of wanted) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE contacts ADD COLUMN ${name} ${ddl};`);
  }
})();

// Reminders originally covered only generic "custom alerts". Calls and
// appointments were added later as typed reminders that can optionally point
// at the contact they're about, so older databases need both columns added.
(function migrateAlertColumns() {
  const cols = (db.prepare("PRAGMA table_info(custom_alerts)").all() as { name: string }[]).map((c) => c.name);
  const wanted: Array<[string, string]> = [
    ["kind", "TEXT NOT NULL DEFAULT 'general'"],
    ["contact_id", "TEXT REFERENCES contacts(id)"],
  ];
  for (const [name, ddl] of wanted) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE custom_alerts ADD COLUMN ${name} ${ddl};`);
  }
})();

// Same idea for integrations: real OAuth tokens (Google) and API credentials
// (WhatsApp) were added after the first version shipped with just a
// connected/disconnected flag.
(function migrateIntegrationColumns() {
  const cols = (db.prepare("PRAGMA table_info(integrations)").all() as { name: string }[]).map((c) => c.name);
  const wanted: Array<[string, string]> = [
    ["access_token", "TEXT"],
    ["refresh_token", "TEXT"],
    ["token_expiry", "TEXT"],
    ["extra", "TEXT"],
  ];
  for (const [name, ddl] of wanted) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE integrations ADD COLUMN ${name} ${ddl};`);
  }
})();

// Real Ziina-backed billing: which interval an org pays for, when the
// current paid (or trial) period actually runs out, a coarse status used to
// gate access, a grace deadline before that gate closes, and bookkeeping for
// the Ziina payment intent behind the most recent renewal so a webhook and a
// success-page check can't both apply the same payment twice.
(function migrateBillingColumns() {
  const cols = (db.prepare("PRAGMA table_info(organizations)").all() as { name: string }[]).map((c) => c.name);
  const wanted: Array<[string, string]> = [
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
  ];
  for (const [name, ddl] of wanted) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE organizations ADD COLUMN ${name} ${ddl};`);
  }
})();

// ---- one-time demo seed -----------------------------------------------
const orgCount = (db.prepare("SELECT COUNT(*) as c FROM organizations").get() as { c: number }).c;
if (orgCount === 0) {
  seedDemoData();
}

function seedDemoData() {
  const orgId = id();
  const trialEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare(
    "INSERT INTO organizations (id, name, plan, trial_ends_at, promo_bonus_days, created_at) VALUES (?,?,?,?,?,?)"
  ).run(orgId, "Pearl Demo", "trial", trialEnds, 0, now());

  const userId = id();
  db.prepare(
    "INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(userId, orgId, "Federica Camurri", "demo@pearlcrm.ae", bcrypt.hashSync("demo1234", 10), "ADMIN", now());

  const companies = [
    { name: "Azure Bay Hotels Group", sector: "Hospitality", website: "azurebayhotels.ae" },
    { name: "Meridian Precision Engineering", sector: "Manufacturing", website: "meridianprecision.ae" },
    { name: "Al Waha Trading LLC", sector: "Import/Export", website: "alwahatrading.ae" },
    { name: "GreenPack Packaging", sector: "Packaging", website: "greenpack.ae" },
    { name: "Dubai Silicon Ventures", sector: "Tech / Venture", website: "dsventures.ae" },
    { name: "Falcon Industrial Systems", sector: "Industrial Systems", website: "falconindustrial.ae" },
  ];
  const companyIds = companies.map((c) => {
    const cid = id();
    db.prepare("INSERT INTO companies (id, org_id, name, sector, website, created_at) VALUES (?,?,?,?,?,?)").run(
      cid,
      orgId,
      c.name,
      c.sector,
      c.website,
      now()
    );
    return cid;
  });

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
  const contactIds = contactsSeed.map((c) => {
    const ctid = id();
    db.prepare(
      "INSERT INTO contacts (id, org_id, company_id, name, email, phone, tags, interest, budget_tier, target_segment, source, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(ctid, orgId, companyIds[c.company], c.name, c.email, c.phone, "[]", c.interest, c.budgetTier, c.targetSegment, c.source, userId, now());
    return ctid;
  });

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
  const dealIds = dealsSeed.map((d) => {
    const did = id();
    db.prepare(
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
    return did;
  });

  const activityTypes: Array<[string, string]> = [
    ["email", "Email sent: commercial proposal recap"],
    ["call", "Alignment call (15 min)"],
    ["whatsapp", "WhatsApp message: document receipt confirmed"],
    ["meeting", "Meeting at the client's office"],
    ["note", "Internal note: watch Q3 budget under review"],
  ];
  dealIds.forEach((dealId, i) => {
    const contactId = contactIds[dealsSeed[i].contact];
    for (let k = 0; k < 3; k++) {
      const [type, content] = activityTypes[(i + k) % activityTypes.length];
      db.prepare(
        "INSERT INTO activities (id, org_id, contact_id, deal_id, type, content, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
      ).run(id(), orgId, contactId, dealId, type, content, daysAgo(dealsSeed[i].lastInteraction + k * 4), now());
    }
  });

  const tasksSeed = [
    { title: "Call James Carter back for proposal follow-up", due: -1, deal: 0, contact: 0, priority: "high" },
    { title: "Send updated price list to Emily Novak", due: 0, deal: 1, contact: 1, priority: "high" },
    { title: "Prepare slides for call with Sara Al Qassimi", due: 1, deal: 4, contact: 4, priority: "medium" },
    { title: "Review contract with legal team", due: 2, deal: 4, contact: 4, priority: "medium" },
    { title: "Follow up after meeting with Michael Ferraro", due: 0, deal: 5, contact: 5, priority: "low" },
  ];
  tasksSeed.forEach((t) => {
    db.prepare(
      "INSERT INTO tasks (id, org_id, contact_id, deal_id, title, due_date, done, priority, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(id(), orgId, contactIds[t.contact], dealIds[t.deal], t.title, daysAgo(-t.due), 0, t.priority, userId, now());
  });

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
  db.prepare(
    "INSERT INTO meetings (id, org_id, contact_id, deal_id, title, date, transcript, summary_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(
    id(),
    orgId,
    contactIds[4],
    dealIds[4],
    "Seed investment call - first meeting",
    daysAgo(5),
    null,
    JSON.stringify(meetingSummary),
    now()
  );

  db.prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)").run(
    id(),
    orgId,
    "gmail",
    1,
    daysAgo(12)
  );
  db.prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)").run(
    id(),
    orgId,
    "calendar",
    1,
    daysAgo(12)
  );
  db.prepare("INSERT INTO integrations (id, org_id, provider, connected, connected_at) VALUES (?,?,?,?,?)").run(
    id(),
    orgId,
    "whatsapp",
    0,
    null
  );

  db.prepare(
    "INSERT INTO campaigns (id, org_id, title, message, channel, segment_interest, segment_budget_tier, segment_target_segment, status, recipient_count, created_at, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
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

  db.prepare(
    "INSERT INTO custom_alerts (id, org_id, title, remind_at, done, created_at) VALUES (?,?,?,?,?,?)"
  ).run(id(), orgId, "Follow up on Q3 renewal promo with high-budget hospitality accounts", daysAgo(-2), 0, now());

  // eslint-disable-next-line no-console
  console.log("[ahead-pearl] Demo data seeded. Login: demo@pearlcrm.ae / demo1234");
}
