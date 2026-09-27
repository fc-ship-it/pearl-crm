# Pearl — AI-first CRM by AHEAD LLC (working MVP)

A real application (not a single demo file): Next.js + TypeScript, with a real backend, database and authentication. This is the AHEAD LLC–branded edition of the CRM (same product as NEXUS Pulse, AHEAD's Dubai-market brand) — pearlescent white base, dark navy ink, teal/gold accents echoing the Pearl logo mark.

## Quick start

Pearl needs a Postgres database — see "Database (Postgres via Neon)" below for why and how to get a free one in a couple of minutes. Once you have a connection string:

```bash
npm install
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require" npm run dev
```

(or put `DATABASE_URL=...` in a `.env.local` file instead of passing it inline — Next.js loads it automatically).

Open `http://localhost:3000`. On first run the database creates its schema and seeds itself with realistic demo data (UAE contacts, pipeline, tasks, one already-generated meeting) — nothing else to set up.

**Demo login:** `demo@pearlcrm.ae`, password rotated away from the old public default — see `NEW_DEMO_PASSWORD` in `src/lib/db.ts` (kept out of this file on purpose since this repo may not stay private forever; the login page no longer has an autofill button for it).

## What's real and what's mocked

| Area | Status |
|---|---|
| Authentication (signup/login, signed-cookie session) | **Real** |
| Multi-tenant (each company is isolated) | **Real** |
| Team members (Settings → Team: add teammates, Admin sees everyone, Sales sees only their own) | **Real**, enforced at the database query level — see "Team members" below |
| Drag&drop pipeline, stage persistence | **Real**, saved to the database |
| "Reactivate today" alerts (time × value × stage) | **Real**, computed from the data |
| Tasks and checklist | **Real** |
| AI meeting minutes | **Real but rule-based**, not a language model — see below |
| Lead qualification (interest, budget tier, target segment) | **Real**, saved to the database and used for filtering/campaign targeting |
| QR code scanning (live camera + image upload) | **Real decoding** (vCard and WhatsApp "click to chat" links), via the client-side `jsQR` library |
| Contact import from Android/Apple (.vcf / vCard export) | **Real parsing**, hand-written vCard 2.1/3.0 parser, no contacts API access needed |
| Campaigns (segmented promotions) | **Real targeting/audience matching**; **real send** once Gmail, Outlook Mail, and/or WhatsApp is connected, falls back to simulated otherwise (see below) |
| Custom alerts / reminders | **Real**, saved to the database, surfaced on the dashboard when due |
| Gmail / Google Calendar / Outlook Mail / Outlook Calendar / WhatsApp integrations | **Real** — genuine OAuth (Google, Microsoft) and Cloud API (WhatsApp) once you complete the one-time setup in "Connecting real integrations" below. Gmail and Outlook can both be connected at once, and each is **per-teammate** (see "Team members" below) — WhatsApp is the one shared, org-wide connection. |
| Plans and billing | **Real** — Ziina payment intents in AED (weekly/monthly/annual), with automatic renewal-link emails and an access gate on non-payment. See `ZIINA_INTEGRATION.md` for setup and design notes. |

### Contact capture: QR codes, device import, manual entry

From **Contacts → + Add contact** you can add a lead three ways:

- **Manual entry**, plus qualification fields (interested-in text, target segment, budget tier) used later for filtering and campaign targeting.
- **Scan a QR code** — either with a live camera feed (`getUserMedia` + `jsQR` decoding each frame) or by uploading a photo of a code. The scanner recognizes vCard QR codes (prefills name/email/phone/company) and WhatsApp "click to chat" links (`wa.me/<number>`), extracting the phone number. A personal WhatsApp "My QR code" (`wa.me/qr/...`) is deliberately **not** faked into a phone number — it's an opaque token that only resolves inside the WhatsApp app, and the UI says so honestly instead of pretending to decode it.
- **Import from Android or Apple** — export contacts as a `.vcf` file from either platform's Contacts app and upload it here. Every parsed contact is shown in a checkable preview (so you can exclude some) with an optional batch tag (interest/segment/budget) applied to everyone imported. Duplicates (matched by phone or email against existing contacts) are automatically skipped.

Every contact keeps a `source` badge (added manually / scanned QR code / WhatsApp QR code / imported from device) visible on the contacts list and contact detail page.

### Campaigns & custom alerts

**Campaigns & alerts** in the sidebar lets you draft a targeted WhatsApp or email promotion, matched live against contacts by interest / budget tier / target segment (leave all three blank to match everyone). Saving creates a draft; "Send now" sends a **real** email (via Gmail, or via Outlook Mail if Gmail isn't connected) or WhatsApp message to every matched contact that has an email/phone, once that integration is connected in Settings — contacts missing the needed field, or an integration that isn't connected, are reported back as "skipped" rather than silently failing. If both Gmail and Outlook Mail are connected, Gmail is used for sending (so there's one predictable "from" mailbox rather than picking one at random per contact); either one alone is enough. With nothing connected it behaves exactly as before: a simulated send, with a real audience match, recipient count, and per-contact activity-log entry ("Campaign sent: …"). **Custom alerts** are simple dated reminders that show up as a banner on the dashboard once they're due, alongside the automatic "reactivate today" alerts.

### Why the meeting minutes don't call a real AI model

`src/lib/verbale.ts` structures the pasted text (notes or transcript) into key points, decisions, objections and next steps with a keyword classifier — not a language model. It works offline at zero cost, but is more rigid than a real LLM. To connect a real model (e.g. Claude via API):

1. Add `ANTHROPIC_API_KEY` to the environment variables.
2. In `src/app/api/meetings/route.ts`, replace the call to `generateVerbale(...)` with a call to the Claude API that receives the same text and returns JSON in the same shape (`MeetingSummary` in `src/lib/data.ts`).

The whole interface ("New meeting" page, minutes view, automatic tasks) stays identical: only the function that generates the content changes.

## Connecting real integrations (Google + Outlook + WhatsApp)

Settings → Integrations has five cards. Gmail and Google Calendar connect through a real Google OAuth flow (one login covers both, since it's the same Google account); Outlook Mail and Outlook Calendar connect the same way through a real Microsoft OAuth flow (one Microsoft/Microsoft 365 login covers both); WhatsApp Business connects by pasting credentials from Meta's own dashboard, the same pattern most CRMs use before building the heavier "Embedded Signup" flow. Nothing here is faked — but the Google/Microsoft ones need a one-time **developer** setup that only you (AHEAD LLC) can do, because it requires creating an app registration with Google/Microsoft (see below); once that's done, it's a one-click "Connect" for every customer, forever after. Google and Outlook are entirely independent: an account can connect one, the other, or both at the same time (e.g. a Gmail inbox and an Outlook inbox connected together). And **each is personal**: if an organization has added teammates (see "Team members" below), every teammate connects their own Gmail/Outlook here, independently of everyone else's — WhatsApp Business is the only one of the five that's shared across the whole team.

### Google Calendar + Gmail

What it unlocks once connected: "Send now" on an email campaign actually emails every matched contact from your Gmail account, and every dated follow-up task created from AI meeting minutes becomes a real event on your Google Calendar.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (any name, e.g. "Pearl CRM").
2. In that project, go to **APIs & Services → Library** and enable two APIs: **Google Calendar API** and **Gmail API**.
3. Go to **APIs & Services → OAuth consent screen**. Choose "External", fill in the required fields (app name "Pearl", your email). While the app is in "Testing" status, only Google accounts you explicitly add as "test users" can connect — add your own account and any customer who wants to try it now; for unlimited customers later, Google's verification review is needed (routine, but takes some days — see their docs).
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type "Web application". Under "Authorized redirect URIs" add exactly: `https://<your-live-domain>/api/integrations/google/callback` (e.g. `https://pearl-crm.netlify.app/api/integrations/google/callback` — must match your real deployed URL exactly, including `https://`).
5. Copy the **Client ID** and **Client secret** it gives you.
6. Add two environment variables on Netlify/Vercel: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.
7. In Pearl, go to Settings → Integrations → Gmail (or Google Calendar) → "Connect", sign in, approve — both cards show "Connected" together.

### Outlook Mail + Outlook Calendar

What it unlocks once connected: "Send now" on an email campaign actually emails every matched contact from your Outlook/Microsoft 365 account (used automatically when Gmail isn't connected), and every dated follow-up task created from AI meeting minutes also becomes a real event on your Outlook Calendar.

1. Go to the [Azure Portal](https://portal.azure.com/) and sign in with the Microsoft account you'll use to administer this (a free Microsoft account is enough to register an app — it doesn't need to be the same account any customer later connects).
2. Go to **Microsoft Entra ID → App registrations → New registration**. Name it anything (e.g. "Pearl CRM"). Under "Supported account types" choose **"Accounts in any organizational directory and personal Microsoft accounts"** — this is what lets any customer connect their own Gmail-style personal Outlook.com account *or* their company's Microsoft 365 account.
3. Under **Redirect URI**, pick platform "Web" and add exactly: `https://<your-live-domain>/api/integrations/outlook/callback` (e.g. `https://pearl-crm.netlify.app/api/integrations/outlook/callback` — must match your real deployed URL exactly, including `https://`).
4. After creating the registration, copy the **Application (client) ID** shown on the Overview page.
5. Go to **Certificates & secrets → New client secret**, create one, and copy its **Value** immediately (like Stripe/Google, Azure only shows it once).
6. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, and add `Mail.Send`, `Calendars.ReadWrite`, `User.Read`, and `offline_access` (the last one is what allows Pearl to silently keep the connection alive without asking the customer to sign in again every hour).
7. Add two environment variables on Netlify/Vercel: `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`, then redeploy.
8. In Pearl, go to Settings → Integrations → Outlook Mail (or Outlook Calendar) → "Connect", sign in, approve — both cards show "Connected" together. This works alongside Gmail/Google Calendar being connected too, on the same account.

### WhatsApp Business

What it unlocks once connected: "Send now" on a WhatsApp campaign actually messages every matched contact with a phone number, via Meta's official Cloud API.

1. This needs an approved **WhatsApp Business Account** through [Meta for Developers](https://developers.facebook.com/) — business verification is Meta's own process and typically takes **1-3 weeks**; nothing in this codebase can shorten that.
2. Once approved, in the Meta for Developers dashboard for your app, go to **WhatsApp → API Setup**. There you'll find a **temporary access token** (or generate a permanent one under System Users, recommended for production) and a **Phone Number ID**.
3. In Pearl, go to Settings → Integrations → WhatsApp Business → "Connect", paste the access token and Phone Number ID, and submit — Pearl calls Meta's API right away to confirm they work before marking it connected.
4. **Important limitation to know about**: Meta only allows free-form text messages within 24 hours of the customer's last message to you (the "customer service window"). Outside that window, only a pre-approved message **template** can be sent. Pearl's campaign send uses free-form text — great for following up an active conversation, not guaranteed for cold outbound to a whole segment. Template support can be added later if you need it for broader campaigns.

## Team members (Settings → Team)

An organization starts with one login — the person who signed up, role `ADMIN`. From **Settings → Team** (visible to admins only), that person can add teammates: a name, email, and an initial password they share directly (there's no outbound invite-email flow yet — the teammate just logs in with what they were given). Each teammate gets:

- Their **own login** under the same organization/subscription — not a separate signup, not separate billing.
- A role: `ADMIN` (sees the whole team's contacts, deals, dashboard and statistics — same as the org's original owner) or `SALES` (sees **only** the contacts and deals assigned to them, everywhere in the app: dashboard numbers, the pipeline board, the contacts list, statistics). This is enforced at the database query level (every list/read function takes the viewer's id and adds `AND owner_id = ?` for a non-admin), not just hidden in the UI — a `SALES` teammate can't reach another teammate's contact or deal even by guessing its URL.
- Their **own Gmail/Outlook connection**, independent of every other teammate's — see the next section. WhatsApp Business stays one shared company number for the whole team (that's how WhatsApp Business numbers work in real life).

Removing a teammate ("Deactivate" in Settings → Team) blocks their login immediately but keeps their name on the contacts/deals/tasks they worked on — nothing is deleted or reassigned, exactly like keeping an ex-employee's name on old paperwork. An admin always sees that history regardless of who's still active.

**A note on what this means for selling Pearl to teams:** don't promise a prospect "each of your salespeople gets their own dashboard" as a future/roadmap item — it's built and live today, the moment you add them from Settings → Team. Conversely, don't promise anything this section doesn't cover (e.g. custom permission levels beyond Admin/Sales, or per-teammate billing) until it's actually built.

## Data storage & isolation between customers

Everything lives in one Postgres database (see "Database (Postgres via Neon)" below) — there is no separate database per customer. What keeps one organization's data from ever being visible to another is that **every single table row carries an `org_id`, and every query in the app filters by it** (`WHERE org_id = ?`, on every read and every write, with no exceptions) — this is checked at the database-query level in `src/lib/data.ts`, not just hidden by the UI. A new signup gets a fresh, empty `org_id`; nothing from the demo account or any other customer is ever attached to it. Team members (above) narrow this further within one organization — a `SALES` teammate's queries add `AND owner_id = ?` on top of the org filter, so they see even less than their own admin does.

If a prospect asks specifically about data residency or hosting: the database is hosted on Neon (Postgres), and the app itself on Netlify — both are the infrastructure providers, not AHEAD LLC's own servers. If that specific detail (e.g. which country the database physically lives in) ever matters to a customer's compliance requirements, that's a question for Neon's own documentation/support, not something this codebase controls.

## Push notifications ("never forget a follow-up")

Real Web Push — an actual OS-level notification on a salesperson's phone, even with Pearl closed — for reminders/alerts that just became due, tasks due today or tomorrow, a failed payment, or a trial about to end. Three pieces:

1. **VAPID keys** (identify this app to the push services — not a secret you need to obtain from anywhere, just a keypair generated once for this project):
   - `VAPID_PUBLIC_KEY`: `BIR4HVC9Nk_YbXzgWvtmEqk5vAPIJtK8hrABVxRHw_uHX5uIMR3uQDa1j2mD-Kv5jWpOdhL9PRm76B34uZB9aoA`
   - `VAPID_PRIVATE_KEY`: `MAKYN-AXseObJrBvSzEEkGso1Kln0H-SDY7xW_Yx6Cg`
   - `VAPID_SUBJECT`: `mailto:ceo@ahead-llc.com` (any contact address works)
   - Add all three as environment variables on Netlify/Vercel, then redeploy. (If you'd rather generate your own pair instead of using these: `npx web-push generate-vapid-keys`.)
2. **The 15-minute sweep** for due reminders/tasks needs the same kind of external "ping this URL on a schedule" cron already used for billing (see `CRON_SECRET` below) — set up a second free cron job (e.g. on [cron-job.org](https://cron-job.org)) hitting `GET {your-domain}/api/push/cron?token=CRON_SECRET` every 15 minutes. Payment-failed and trial-ending pushes don't need this — they fire immediately from the Stripe webhook instead.
3. **One more Stripe webhook event**: in the Stripe dashboard, on the webhook endpoint you already created (see the Stripe setup in `src/lib/stripe.ts`), add `customer.subscription.trial_will_end` to the list of subscribed events (alongside the ones already there) — that's what triggers the "trial about to end" push.

Each salesperson then turns notifications on themselves, once, from **Settings → Integrations → Notifiche push → "Attiva notifiche"** — this only works with Pearl installed to the phone's home screen (not a regular browser tab), and on iPhone needs iOS 16.4 or newer.

## Database (Postgres via Neon)

Pearl stores everything in Postgres, via the `pg` client (`src/lib/db.ts`) — no ORM, plain SQL, same shape of queries throughout `src/lib/data.ts`.

**Why not SQLite:** an earlier version of this project used Node's built-in `node:sqlite`, writing to a local file — simple for a demo, but broken for real use on Netlify/Vercel: their filesystem is read-only outside `/tmp`, and `/tmp` is **not shared** between separate serverless function instances. In practice this meant two different requests could see two different (often empty) "databases" — the cause of a real bug where a user who had just signed up could immediately fail to log back in. Postgres, reached over the network from every instance alike, doesn't have this problem.

**Getting a free Postgres database (Neon):**

1. Go to [neon.tech](https://neon.tech) and create a free account (their free tier is more than enough for Pearl).
2. Create a new project (any name, e.g. "pearl-crm"). Neon creates a default database and gives you a **connection string** right away — copy it (it looks like `postgresql://<user>:<password>@<host>/<db>?sslmode=require`).
3. Add it as the `DATABASE_URL` environment variable — locally in `.env.local` for development, and on Netlify/Vercel under Site settings → Environment variables for production (see "Deploy" below). Never share this connection string outside your own environment variables — it's a credential, treat it like a password.
4. Deploy (or restart `npm run dev` locally). The schema and demo data create themselves automatically on first request — no migration step to run by hand.

The schema lives in `src/lib/db.ts` as plain `CREATE TABLE IF NOT EXISTS` statements, plus a small set of `ALTER TABLE ADD COLUMN IF NOT EXISTS`-style guards so an existing database picks up new columns automatically as the product grows — no separate migration tool needed for a project this size.

## Deploy

The app is a standard Next.js project: it deploys to Vercel, Netlify, or any Node hosting, with zero config changes.

### Deploying to Netlify

1. Push this project to a GitHub (or GitLab/Bitbucket) repository.
2. In the [Netlify dashboard](https://app.netlify.com/), "Add new site" → "Import an existing project", and pick that repository. Netlify auto-detects Next.js (via its built-in Next.js Runtime) — no build settings to change.
3. Before the first deploy, add these environment variables under Site settings → Environment variables:
   - `DATABASE_URL` — your Neon (or any Postgres) connection string. See "Database (Postgres via Neon)" above. Required — the app refuses to start without it.
   - `AUTH_SECRET` (any long random string, e.g. generated with `openssl rand -base64 32`). Without it the app falls back to a development secret hardcoded in the code — fine for a quick look, not for anything real.
   - `OWNER_PASSWORD` — the password for **your** private Owner Dashboard (see below). Without it, the app falls back to a hardcoded dev password (`pearl-owner-dev-password`) — change this before sharing the link with anyone.
   - (optional) `RESEND_API_KEY` and `OWNER_NOTIFY_EMAIL` — see "Getting notified of new signups by email" below.
   - (optional, for real billing) `ZIINA_ACCESS_TOKEN` and `CRON_SECRET` — see `ZIINA_INTEGRATION.md`.
4. Deploy. The database schema and demo data create themselves automatically on first request against `DATABASE_URL` — no separate migration step.

### Deploying to Vercel

Same idea: push to GitHub, [import the repository](https://vercel.com/new) (auto-detected as Next.js), add the same environment variables (including `DATABASE_URL`) in the Vercel project settings, deploy.

**About the database on Netlify/Vercel:** because Pearl's data lives in Postgres (reached over the network) rather than a file on disk, it works correctly on serverless hosting — every function instance sees the same, real, persistent data, unlike the old SQLite-on-`/tmp` setup this project used to have (see "Database (Postgres via Neon)" above for why that was a problem).

## Owner Dashboard — seeing every business that signs up

Every time someone creates a Pearl account from the landing page, a new organization (tenant) is created, scoped and isolated from every other tenant's data — that's how the product's own customers stay private from each other. Separately, **AHEAD LLC** (Federica) has its own private area to see and manage every one of those signups in one place:

- **`/owner/login`** — a separate login, unrelated to any customer's login. Password is set by the `OWNER_PASSWORD` environment variable (falls back to `pearl-owner-dev-password` if unset — change this in production).
- **`/owner/dashboard`** — lists every registered business (plan, trial status, number of users/contacts/deals, signup date) and every user across all of them (name, email, company, role, signup date), with quick actions to extend a trial by 14 days or change a business's plan.

This is the reliable way to see new signups: it reads directly from the same database every tenant's data lives in, so as long as a signup was saved, it shows up here — no separate sync step, nothing that can silently fail.

### Getting notified of new signups by email (optional)

The dashboard above works with zero setup. If you also want an email the moment someone signs up (handy after networking events, so you don't have to keep checking the dashboard), Pearl can send one automatically via [Resend](https://resend.com) — a transactional email service with a free tier that only needs an API key (no mail server to run):

1. Create a free Resend account and copy an API key.
2. Add two environment variables: `RESEND_API_KEY` (the key) and `OWNER_NOTIFY_EMAIL` (the address that should receive new-signup alerts, e.g. your own).
3. Redeploy. From then on, every signup sends a short email with the new company's name and the signer's name/email.

Without these two variables set, this step is silently skipped — signups still save normally and still appear on the dashboard, you just won't get an email about them.

## From MVP to production — what's genuinely still missing

Some parts require external approval steps that no AI agent can compress into a few hours, regardless of the tool used:

- **Official WhatsApp Business API approval**: the code is real and ready (see "Connecting real integrations" above), but it can only be used after Meta approves your WhatsApp Business Account — business verification, dedicated number, typically 1-3 weeks.
- **Google OAuth verification for scale**: connecting Gmail/Calendar works today for test users you add by hand in the Google Cloud Console; opening it to unlimited customers without that manual step requires Google's standard OAuth verification review of the same app.
- **GDPR / DPA**: records of processing activities, a Data Processing Agreement with customers, a legal privacy notice (not a generic template).
- **Tax receipts / invoices** for the now-real Ziina billing (see `ZIINA_INTEGRATION.md`) — payments work, but there's no generated PDF invoice yet.

Everything else (CRM functionality, UX, pipeline, alerts, dashboard, meeting minutes) is already a working, demoable product.

## Project structure

```
src/
  app/                    pages (App Router): landing, login/signup, /app/* (authenticated product)
    owner/                AHEAD LLC's private dashboard: /owner/login, /owner/dashboard (see "Owner Dashboard" above)
  components/             React components (dashboard, pipeline kanban, landing)
  lib/
    db.ts                 Postgres connection (via Neon), schema + demo data seed
    data.ts               all queries (the only place to touch to change database), incl. cross-tenant owner views
    domain.ts             product constants: pipeline stages, colors, urgency score, formatting
    auth.ts               JWT session (tenant login + separate owner login)
    notify.ts             optional email alert to AHEAD LLC on new signup (see "Getting notified" above)
    google.ts             real Google OAuth + Calendar/Gmail API calls (see "Connecting real integrations")
    whatsapp.ts           real WhatsApp Business Cloud API calls (see "Connecting real integrations")
    verbale.ts            structured meeting-minutes generator
    vcard.ts               vCard parser + QR payload classifier (vCard / WhatsApp link / phone / URL / text)
  proxy.ts                protects /app/* (customer login) and /owner/* (AHEAD LLC login) separately
```

## Interactive demo

A self-contained, browsable demo (no install needed) mirroring this app's screens — same English UI, same AED pricing, same sample data — is available as a hosted link for quick walkthroughs without running the project locally.
