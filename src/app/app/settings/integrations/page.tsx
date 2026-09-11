import { getSession } from "@/lib/auth";
import { listIntegrations } from "@/lib/data";
import { isGoogleConfigured } from "@/lib/google";
import IntegrationCard from "@/components/IntegrationCard";
import { Mail, MessageCircle, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";

const CONFIG = [
  {
    provider: "gmail",
    name: "Gmail",
    color: "#00d4ff",
    icon: <Mail size={18} color="#00d4ff" />,
    description: "Send emails to a contact straight from Pearl, using your own Gmail account.",
    mode: "oauth" as const,
  },
  {
    provider: "whatsapp",
    name: "WhatsApp Business",
    color: "#34d399",
    icon: <MessageCircle size={18} color="#34d399" />,
    description: "Send WhatsApp messages to contacts from Pearl via Meta's official Cloud API.",
    mode: "apikey" as const,
  },
  {
    provider: "calendar",
    name: "Google Calendar",
    color: "#c9a227",
    icon: <Calendar size={18} color="#c9a227" />,
    description: "Follow-up tasks with a due date get created as real events on your Google Calendar.",
    mode: "oauth" as const,
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google non è ancora configurato su questo deploy: mancano le variabili GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (vedi README).",
  google_missing_code: "Google non ha restituito i permessi richiesti. Riprova.",
  google_token_exchange_failed: "Non sono riuscito a completare il collegamento con Google. Riprova.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getSession();
  const rows = await listIntegrations(session!.orgId);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const { connected, error } = await searchParams;

  return (
    <div className="max-w-[1000px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Integrations
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        These connect to the real Google and WhatsApp APIs — see the project README for the one-time setup each
        one needs (a free Google Cloud project for Gmail/Calendar, an approved Meta WhatsApp Business Account for
        WhatsApp).
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
              googleConfigured={isGoogleConfigured()}
            />
          );
        })}
      </div>
    </div>
  );
}
