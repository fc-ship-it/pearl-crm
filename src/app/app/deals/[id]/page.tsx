import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getDeal } from "@/lib/data";
import { formatCurrency, formatDate, relativeDaysLabel, stageConfig } from "@/lib/domain";
import AttachmentsPanel from "@/components/AttachmentsPanel";

/**
 * Minimal deal detail page — there wasn't one before this: the pipeline
 * board (PipelineBoard.tsx) only ever linked a deal's card to its contact.
 * This exists mainly to give photo attachments (site-inspection photos,
 * handwritten notes) somewhere to live for a deal, the same way contacts
 * and meetings already have a detail page — so it stays intentionally light
 * rather than duplicating the full contact-detail layout.
 */
export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // A "SALES" teammate can't open another teammate's deal by guessing its
  // id — getDeal returns null (→ 404) if they don't own it, same rule as
  // the contact and PATCH-stage routes already use.
  const viewerOwnerId = session!.role === "ADMIN" ? undefined : session!.userId;
  const deal = await getDeal(session!.orgId, id, viewerOwnerId);
  if (!deal) notFound();

  const cfg = stageConfig(deal.stage);

  return (
    <div className="max-w-[800px] space-y-5">
      <div>
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          {deal.title}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
          {deal.contactId ? (
            <Link href={`/app/contacts/${deal.contactId}`} style={{ color: "var(--cyan)" }}>
              {deal.contactName}
            </Link>
          ) : (
            "Nessun contatto collegato"
          )}
          {deal.companyName ? ` · ${deal.companyName}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: `${cfg.color}22`, color: cfg.color }}>
            {cfg.label}
          </span>
          <span className="text-sm font-mono" style={{ color: "var(--gold)" }}>
            {formatCurrency(deal.value)}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
            {deal.probability}% probabilità
          </span>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--ink-dim)" }}>
          Ultima interazione {relativeDaysLabel(deal.lastInteractionAt)}
          {deal.expectedCloseDate ? ` · Chiusura prevista ${formatDate(deal.expectedCloseDate)}` : ""}
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-sm mb-4" style={{ color: "var(--ink)" }}>
          Foto del sopralluogo e appunti
        </h2>
        <AttachmentsPanel dealId={deal.id} />
      </div>
    </div>
  );
}
