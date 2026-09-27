import { getSession } from "@/lib/auth";
import { listIntegrations, listUserIntegrations } from "@/lib/data";
import { isGoogleConfigured } from "@/lib/google";
import { isOutlookConfigured } from "@/lib/outlook";
import IntegrationCard from "@/components/IntegrationCard";
import NotificationsCard from "@/components/NotificationsCard";
import { Mail, MessageCircle, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";

const CONFIG = [
  {
    provider: "gmail",
    name: "Gmail",
    color: "#00d4ff",
    icon: <Mail size={18} color="#00d4ff" />,
    description: "Send emails to a contact straight from Pearl, using your own Gmail account.",
    mode: "oauth" as const,
    oauthConnectHref: "/api/integrations/google/connect",
  },
  {
    provider: "outlook_mail",
    name: "Outlook Mail",
    color: "#0a8fd6",
    icon: <Mail size={18} color="#0a8fd6" />,
    description: "Send emails to a contact straight from Pearl, using your own Outlook / Microsoft 365 account.",
    mode: "oauth" as const,
    oauthConnectHref: "/api/integrations/outlook/connect",
  },
  {
    provider: "whatsapp",
    name: "WhatsApp Business",
    color: "#34d399",
    icon: <MessageCircle size={18} color="#34d399" />,
    description: "Send WhatsApp messages to contacts from Pearl via Meta's official Cloud API.",
    mode: "apikey" as const,
    oauthConnectHref: undefined as string | undefined,
  },
  {
    provider: "calendar",
    name: "Google Calendar",
    color: "#c9a227",
    icon: <Calendar size={18} color="#c9a227" />,
    description: "Follow-up tasks with a due date get created as real events on your Google Calendar.",
    mode: "oauth" as const,
    oauthConnectHref: "/api/integrations/google/connect",
  },
  {
    provider: "outlook_calendar",
    name: "Outlook Calendar",
    color: "#7c6fd6",
    icon: <Calendar size={18} color="#7c6fd6" />,
    description: "Follow-up tasks with a due date get created as real events on your Outlook Calendar.",
    mode: "oauth" as const,
    oauthConnectHref: "/api/integrations/outlook/connect",
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google non è ancora configurato su questo deploy: mancano le variabili GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (vedi README).",
  google_missing_code: "Google non ha restituito i permessi richiesti. Riprova.",
  google_token_exchange_failed: "Non sono riuscito a completare il collegamento con Google. Riprova.",
  outlook_not_configured:
    "Outlook non è ancora configurato su questo deploy: mancano le variabili MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (vedi README).",
  outlook_missing_code: "Microsoft non ha restituito i permessi richiesti. Riprova.",
  outlook_token_exchange_failed: "Non sono riuscito a completare il collegamento con Outlook. Riprova.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getSession();
  // WhatsApp is org-wide (one shared company number) — read from the org
  // table. Gmail/Calendar/Outlook are per-teammate: prefer THIS user's own
  // row (user_integrations); fall back to the org-wide legacy row only if
  // they never personally connected one (e.g. the account connected Google
  // before Settings -> Team existed) — same fallback used by
  // getValidGoogleAccessToken/getValidOutlookAccessToken.
  const orgRows = await listIntegrations(session!.orgId);
  const orgByProvider = new Map(orgRows.map((r) => [r.provider, r]));
  const ownRows = await listUserIntegrations(session!.userId);
  const ownByProvider = new Map(ownRows.map((r) => [r.provider, r]));
  const byProvider = new Map([
    ...orgByProvider,
    ...ownByProvider, // personal rows win where both exist
  ]);
  const { connected, error } = await searchParams;

  return (
    <div className="max-w-[1000px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Integrations
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        These connect to the real Google, Microsoft, and WhatsApp APIs — see the project README for the one-time
        setup each one needs. Gmail/Calendar and Outlook Mail/Calendar are personal: each teammate connects their
        own account here (see Settings → Team). WhatsApp Business is shared across the whole team, since it is one
        company number.
      </p>

      {connected && (
        <div className="flex items-center gap-2 text-sm mb-4 p-3 rounded-xl" style={{ background: "rgba(23,166,115,0.12)", color: "var(--success)" }}>
          <CheckCircle2 size={16} /> Collegato correttamente.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm mb-4 p-3 rounded-xl" style={{ background: "rgba(229,72,77,0.12)", color: "var(--danger)" }}>
          <AlertTriangle size={16} /> {ERROR_MESSAGES[error] || "Qualcosa è andato storto."}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CONFIG.map((c) => {
          const row = byProvider.get(c.provider);
          let extra: Record<string, unknown> = {};
          try {
            extra = row?.extra ? JSON.parse(row.extra) : {};
          } catch {
            extra = {};
          }
          const configured =
            c.mode === "oauth"
              ? c.provider === "gmail" || c.provider === "calendar"
                ? isGoogleConfigured()
                : isOutlookConfigured()
              : true;
          return (
            <IntegrationCard
              key={c.provider}
              provider={c.provider}
              name={c.name}
              description={c.description}
              color={c.color}
              icon={c.icon}
              mode={c.mode}
              connected={!!row?.connected}
              connectedAt={row?.connected_at ?? null}
              detail={(extra.email as string) || (extra.displayNumber as string) || null}
              oauthConnectHref={c.oauthConnectHref}
              configured={configured}
            />
          );
        })}
      </div>

      <div className="mt-4">
        <NotificationsCard />
      </div>
    </div>
  );
}
