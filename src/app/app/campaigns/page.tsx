import { getSession } from "@/lib/auth";
import { listCampaigns, listCustomAlerts, listContacts } from "@/lib/data";
import CampaignsBoard from "@/components/CampaignsBoard";

export default async function CampaignsPage() {
  const session = await getSession();
  const orgId = session!.orgId;
  const campaigns = listCampaigns(orgId);
  const alerts = listCustomAlerts(orgId);
  const allContacts = listContacts(orgId);
  const segments = Array.from(new Set(allContacts.map((c) => c.targetSegment).filter(Boolean))) as string[];

  return (
    <div className="max-w-[1100px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Campaigns & alerts
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Launch a targeted promotion to a segment of contacts, and schedule custom reminders alongside the automatic "reactivate today" alerts.
      </p>
      <CampaignsBoard
        campaigns={campaigns}
        alerts={alerts}
        segments={segments}
        contacts={allContacts.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
