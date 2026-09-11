import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getContact, listActivitiesForContact, listDealsForContact } from "@/lib/data";
import { formatCurrency, relativeDaysLabel, initials, avatarColor, ACTIVITY_LABELS, stageConfig, urgencyScore, urgencyLevel, URGENCY_COLORS, budgetTierConfig, contactSourceConfig } from "@/lib/domain";
import { Mail, Phone, MessageCircle, Users as UsersIcon, StickyNote } from "lucide-react";
import LeadTemperaturePicker from "@/components/LeadTemperaturePicker";
import DeleteContactButton from "@/components/DeleteContactButton";

const ICONS: Record<string, any> = { mail: Mail, phone: Phone, "message-circle": MessageCircle, users: UsersIcon, "sticky-note": StickyNote };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const contact = await getContact(session!.orgId, id);
  if (!contact) notFound();

  const activities = await listActivitiesForContact(session!.orgId, id);
  const deals = await listDealsForContact(session!.orgId, id);

  return (
    <div className="max-w-[1000px] space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
          style={{ background: avatarColor(contact.name), color: "var(--ink)" }}
        >
          {initials(contact.name)}
        </div>
        <div>
          <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            {contact.name}
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            {contact.companyName} {contact.email ? `· ${contact.email}` : ""} {contact.phone ? `· ${contact.phone}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {contact.targetSegment && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
                {contact.targetSegment}
              </span>
            )}
            {budgetTierConfig(contact.budgetTier) && (
              <span
                className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                style={{ background: `${budgetTierConfig(contact.budgetTier)!.color}22`, color: budgetTierConfig(contact.budgetTier)!.color }}
              >
                {budgetTierConfig(contact.budgetTier)!.label} budget
              </span>
            )}
            {contact.interest && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(15,181,166,0.12)", color: "var(--cyan)" }}>
                Interested in: {contact.interest}
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ border: "1px solid var(--border)", color: "var(--ink-dim)" }}>
              {contactSourceConfig(contact.source).label}
            </span>
          </div>
          <div className="mt-3">
            <LeadTemperaturePicker contactId={contact.id} value={contact.temperature} />
          </div>
        </div>
      </div>
        <DeleteContactButton contactId={contact.id} contactName={contact.name} redirectTo="/app/contacts" size="md" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Interaction timeline
          </h2>
          <div className="space-y-3">
            {activities.length === 0 && (
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                No interactions logged yet.
              </p>
            )}
            {activities.map((a) => {
              const meta = ACTIVITY_LABELS[a.type] || { label: a.type, icon: "sticky-note" };
              const Icon = ICONS[meta.icon];
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                  >
                    <Icon size={13} color="var(--cyan)" />
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: "var(--ink)" }}>
                      {a.content}
                    </div>
                    <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                      {meta.label} · {relativeDaysLabel(a.occurredAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
            Linked opportunities
          </h2>
          <div className="space-y-2">
            {deals.map((d) => {
              const cfg = stageConfig(d.stage);
              const score = urgencyScore(d);
              const level = urgencyLevel(score);
              return (
                <div key={d.id} className="p-3 rounded-lg" style={{ background: "var(--panel-2)" }}>
                  <div className="text-sm" style={{ color: "var(--ink)" }}>
                    {d.title}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                      style={{ background: `${cfg.color}22`, color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--gold)" }}>
                      {formatCurrency(d.value)}
                    </span>
                  </div>
                  {score > 0 && level !== "low" && (
                    <div className="text-[10px] mt-1.5" style={{ color: URGENCY_COLORS[level] }}>
                      Quiet since {relativeDaysLabel(d.lastInteractionAt)} — {level} priority
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
