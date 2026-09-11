import Image from "next/image";
import { listAllOrganizations, listAllUsers, platformStats, listAllSponsors, listFeatureInterest } from "@/lib/data";
import OrgActions from "./OrgActions";
import LogoutButton from "./LogoutButton";
import SponsorsPanel from "./SponsorsPanel";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export default async function OwnerDashboardPage() {
  const stats = await platformStats();
  const orgs = await listAllOrganizations();
  const users = await listAllUsers();
  const sponsors = await listAllSponsors();
  const interest = await listFeatureInterest();
  const interestCounts = { yes: 0, maybe: 0, no: 0 } as Record<string, number>;
  for (const r of interest) interestCounts[r.answer] = (interestCounts[r.answer] ?? 0) + 1;
  const now = Date.now();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-5 py-3"
        style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Image src="/brand/pearl-logo-64.png" alt="" width={24} height={24} />
          <span className="font-display text-sm" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
            Owner — AHEAD LLC
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/owner/export"
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--success)", color: "#fff" }}
          >
            ⬇ Esporta tutto in Excel
          </a>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-5 py-8 space-y-10">
        <section>
          <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
            Tutti i clienti Pearl
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
            Ogni azienda che si registra sulla landing page appare qui automaticamente, con i suoi utenti, contatti e
            trattative.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Aziende registrate", value: stats.totalOrgs },
              { label: "Utenti totali", value: stats.totalUsers },
              { label: "Contatti salvati", value: stats.totalContacts },
              { label: "Prove attive", value: stats.activeTrials },
              { label: "Prove scadute", value: stats.expiredTrials },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <div className="text-2xl font-display" style={{ color: "var(--ink)" }}>
                  {s.value}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-base mb-3" style={{ color: "var(--ink)" }}>
            Aziende ({orgs.length})
          </h2>
          {orgs.length === 0 ? (
            <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
              Ancora nessuna registrazione. Appena qualcuno crea un account da Pearl, comparirà qui.
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm" style={{ color: "var(--ink)" }}>
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--ink-dim)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-3 font-medium">Azienda</th>
                    <th className="px-4 py-3 font-medium">Piano</th>
                    <th className="px-4 py-3 font-medium">Prova scade</th>
                    <th className="px-4 py-3 font-medium">Utenti</th>
                    <th className="px-4 py-3 font-medium">Contatti</th>
                    <th className="px-4 py-3 font-medium">Trattative</th>
                    <th className="px-4 py-3 font-medium">Registrata il</th>
                    <th className="px-4 py-3 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => {
                    const expired = o.plan === "trial" && new Date(o.trialEndsAt).getTime() <= now;
                    return (
                      <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 font-medium">{o.name}</td>
                        <td className="px-4 py-3 capitalize">{o.plan}</td>
                        <td className="px-4 py-3">
                          <span style={{ color: expired ? "var(--danger)" : "var(--ink-dim)" }}>
                            {fmtDate(o.trialEndsAt)}
                            {expired ? " (scaduta)" : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">{o.userCount}</td>
                        <td className="px-4 py-3">{o.contactCount}</td>
                        <td className="px-4 py-3">{o.dealCount}</td>
                        <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                          {fmtDate(o.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <OrgActions orgId={o.id} currentPlan={o.plan} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-base mb-3" style={{ color: "var(--ink)" }}>
            Utenti ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
              Nessun utente ancora.
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm" style={{ color: "var(--ink)" }}>
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--ink-dim)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Azienda</th>
                    <th className="px-4 py-3 font-medium">Ruolo</th>
                    <th className="px-4 py-3 font-medium">Registrato il</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                        {u.email}
                      </td>
                      <td className="px-4 py-3">{u.orgName}</td>
                      <td className="px-4 py-3 capitalize">{u.role.toLowerCase()}</td>
                      <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                        {fmtDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-base mb-3" style={{ color: "var(--ink)" }}>
            Sponsor Business Match ({sponsors.length})
          </h2>
          <SponsorsPanel sponsors={sponsors} />
        </section>

        <section>
          <h2 className="font-display text-base mb-1" style={{ color: "var(--ink)" }}>
            Interesse per un CRM Real Estate
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--ink-dim)" }}>
            Risposte alla domanda mostrata in dashboard: "Ti interesserebbe una versione di Pearl per il real estate,
            con PDF/video dei progetti e invio via mailing list?"
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4 max-w-[500px]">
            <div className="card p-4 text-center">
              <div className="text-2xl font-display" style={{ color: "var(--success)" }}>
                {interestCounts.yes ?? 0}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                Sì
              </div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-display" style={{ color: "var(--warning)" }}>
                {interestCounts.maybe ?? 0}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                Forse
              </div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-display" style={{ color: "var(--ink-dim)" }}>
                {interestCounts.no ?? 0}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                No
              </div>
            </div>
          </div>
          {interest.length === 0 ? (
            <p className="text-sm card p-6" style={{ color: "var(--ink-dim)" }}>
              Ancora nessuna risposta.
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm" style={{ color: "var(--ink)" }}>
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--ink-dim)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-3 font-medium">Azienda</th>
                    <th className="px-4 py-3 font-medium">Persona</th>
                    <th className="px-4 py-3 font-medium">Risposta</th>
                    <th className="px-4 py-3 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {interest.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium">{r.orgName}</td>
                      <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                        {r.userName}
                      </td>
                      <td className="px-4 py-3 capitalize">{r.answer === "yes" ? "Sì" : r.answer === "maybe" ? "Forse" : "No"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                        {fmtDate(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
