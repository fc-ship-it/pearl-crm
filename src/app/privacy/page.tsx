import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Pearl",
  description: "How Pearl (by AHEAD LLC) collects, uses, and protects your data.",
};

const UPDATED = "September 8, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-lg mb-3" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-[820px] mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/pearl-logo-64.png" alt="" width={22} height={22} />
            <span className="font-display text-sm" style={{ color: "var(--ink)" }}>
              PEARL
            </span>
          </Link>
          <Link href="/" className="text-sm" style={{ color: "var(--ink-dim)" }}>
            ← Back to Pearl
          </Link>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-5 py-14">
        <h1 className="font-display text-3xl mb-2" style={{ color: "var(--ink)" }}>
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--ink-dim)" }}>
          Last updated: {UPDATED} · Applies to the Pearl CRM application at pearl-crm.netlify.app
        </p>

        <Section title="1. Who we are">
          <p>
            Pearl is a CRM product built and operated by <strong>AHEAD LLC</strong>, Dubai Silicon Oasis, Office A2
            Digital Park, Dubai, United Arab Emirates. For any privacy question or request, contact us at{" "}
            <a href="mailto:ceo@ahead-llc.com">ceo@ahead-llc.com</a> or +971 58 548 38 03.
          </p>
        </Section>

        <Section title="2. Data you give us directly">
          <p>
            When you sign up for and use Pearl, you (or your organization) provide account information (name, work
            email, password), and business data you choose to enter or import: contacts, companies, deals,
            meeting notes and transcripts, tasks, and campaign content. This data belongs to you — we process it
            only to provide the Pearl service to your organization.
          </p>
        </Section>

        <Section title="3. Google user data (Gmail and Calendar)">
          <p>
            If you choose to connect your Google account from Settings → Integrations, Pearl requests the following
            Google OAuth scopes, and only uses them for the specific purpose described:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>gmail.send</code> — used solely to send an email to a contact when you explicitly click "send"
              inside Pearl. Pearl does not read, scan, store, or otherwise access your Gmail inbox, sent mail, or any
              other message.
            </li>
            <li>
              <code>calendar.events</code> — used solely to create a calendar event when a follow-up task with a due
              date is generated from a meeting you logged in Pearl. Pearl does not read your existing calendar events
              or any calendar other than to add these entries.
            </li>
            <li>
              <code>userinfo.email</code> — used only to confirm which Google account is connected and show that in
              Settings.
            </li>
          </ul>
          <p>
            Pearl's use of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Google account data is never sold, never used for advertising,
            and never shared with third parties beyond what is required to operate the feature you triggered. You can
            revoke this access at any time from Pearl's Settings → Integrations, or directly from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              Google Account permissions
            </a>
            page.
          </p>
        </Section>

        <Section title="4. WhatsApp Business data">
          <p>
            If your organization connects a WhatsApp Business Account (via Meta's Cloud API), Pearl uses the phone
            numbers of your own contacts and the message content you choose to send, solely to deliver that message
            through your WhatsApp Business number. Pearl does not access any other WhatsApp data belonging to you or
            Meta.
          </p>
        </Section>

        <Section title="5. How we store and protect data">
          <p>
            Data is hosted on Netlify's infrastructure. Access tokens for connected integrations (Google, WhatsApp)
            are stored server-side and are never exposed to your browser or to other organizations using Pearl.
            Passwords are stored using one-way hashing (bcrypt) and are never stored or logged in plain text.
          </p>
        </Section>

        <Section title="6. Cookies">
          <p>
            Pearl sets a single session cookie used only to keep you logged in. We do not use third-party
            advertising or tracking cookies.
          </p>
        </Section>

        <Section title="7. Data retention and your rights">
          <p>
            We retain your data for as long as your account is active. You may request a copy of your data, request
            correction, or request deletion of your account and associated data at any time by emailing{" "}
            <a href="mailto:ceo@ahead-llc.com">ceo@ahead-llc.com</a>. Disconnecting an integration from Settings
            immediately revokes and deletes the associated access tokens.
          </p>
        </Section>

        <Section title="8. International data transfers">
          <p>
            AHEAD LLC is based in the United Arab Emirates. Our hosting provider may process data in other
            jurisdictions as part of delivering its infrastructure. We take reasonable steps to ensure data is
            protected consistently with this policy wherever it is processed.
          </p>
        </Section>

        <Section title="9. Children's privacy">
          <p>Pearl is a business tool and is not directed at, or knowingly used by, anyone under the age of 18.</p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We may update this policy as Pearl evolves. Material changes will be reflected by updating the "Last
            updated" date above.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            AHEAD LLC — Dubai Silicon Oasis, Office A2 Digital Park, Dubai, UAE
            <br />
            <a href="mailto:ceo@ahead-llc.com">ceo@ahead-llc.com</a> · +971 58 548 38 03
          </p>
        </Section>
      </main>
    </div>
  );
}
