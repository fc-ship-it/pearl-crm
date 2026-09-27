import { getSession } from "@/lib/auth";
import { listDeals } from "@/lib/data";
import PipelineBoard from "@/components/PipelineBoard";

export default async function PipelinePage() {
  const session = await getSession();
  // A "SALES" teammate only ever sees deals assigned to them; an ADMIN sees
  // the whole team's pipeline, same as before Settings -> Team existed.
  const viewerOwnerId = session!.role === "ADMIN" ? undefined : session!.userId;
  const deals = await listDeals(session!.orgId, viewerOwnerId);

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5">
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Sales pipeline
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
          Drag a card to change its stage, or use the arrows on the card (handy on tablet/mobile).
        </p>
      </div>
      <PipelineBoard deals={deals} />
    </div>
  );
}
