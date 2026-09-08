import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Pearl",
  description: "The terms that govern your use of the Pearl CRM application.",
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

export default function TermsPage() {
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
          Terms &amp; Conditions
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--ink-dim)" }}>
          Last updated: {UPDATED} · Applies to the Pearl CRM application at pearl-crm.netlify.app
        </p>

        <Section title="1. Acceptance of these terms">
          <p>
            Pearl is operated by <strong>AHEAD LLC</strong>, Dubai Silicon Oasis, Office A2 Digital Park, Dubai,
            United Arab Emirates. By creating an account or otherwise using Pearl, you agree to these Terms &amp;
            Conditions and to our{" "}
            <Link href="/privacy">Privacy Policy</Link>. If you are agreeing on behalf of an organization, you confirm
            you have authority to bind that organization.
          </p>
        </Section>

        <Section title="2. The service">
          <p>
            Pearl is a customer relationship management (CRM) application that helps sales teams track contacts,
            deals, meetings, and follow-ups, with optional integrations to third-party services (currently Google
            Gmail/Calendar and WhatsApp Business, via Meta) that you may connect or disconnect at any time from
            Settings.
          </p>
          <p>
            Pearl is offered on a free trial basis, followed by paid subscription plans as described in the app.
            Features, pricing, and trial length may change; we will not change pricing on an active paid
            subscription without reasonable notice.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            You are responsible for keeping your login credentials confidential and for all activity under your
            account. Notify us immediately at <a href="mailto:ceo@ahead-llc.com">ceo@ahead-llc.com</a> if you suspect
            unauthorized use.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>
            You agree not to use Pearl to send unsolicited bulk messages ("spam") via email or WhatsApp, to violate
            any applicable law, to infringe on third-party rights, or to attempt to disrupt or gain unauthorized
            access to Pearl's systems.
          </p>
        </Section>

        <Section title="5. Third-party integrations">
          <p>
            When you connect Google or WhatsApp (Meta) to Pearl, your use of those services remains subject to
            Google's and Meta's own terms of service. AHEAD LLC is not responsible for the availability, accuracy,
            or policies of those third-party services, and integrations may stop working if a third party changes
            or restricts its API.
          </p>
        </Section>

        <Section title="6. Your data">
          <p>
            You retain ownership of the business data you enter into Pearl (contacts, deals, notes, and similar). We
            process it solely to provide the service to you, as described in our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </Section>

        <Section title="7. Intellectual property">
          <p>
            The Pearl application, its design, and underlying software are the property of AHEAD LLC. Nothing in
            these terms transfers ownership of Pearl's software or branding to you.
          </p>
        </Section>

        <Section title="8. Disclaimer and limitation of liability">
          <p>
            Pearl is provided "as is". To the maximum extent permitted by law, AHEAD LLC disclaims warranties of any
            kind and is not liable for indirect, incidental, or consequential damages arising from your use of
            Pearl, including data loss or messages sent through connected third-party integrations.
          </p>
        </Section>

        <Section title="9. Termination">
          <p>
            You may stop using Pearl and close your account at any time. We may suspend or terminate access if these
            terms are violated, or discontinue the service with reasonable notice.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p>These terms are governed by the laws of the United Arab Emirates. Any dispute will be subject to the exclusive jurisdiction of the courts of Dubai.</p>
        </Section>

        <Section title="11. Changes to these terms">
          <p>
            We may update these terms as Pearl evolves. Material changes will be reflected by updating the "Last
            updated" date above.
          </p>
        </Section>

        <Section title="12. Contact">
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
