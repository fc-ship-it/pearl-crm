import { getSession } from "@/lib/auth";
import { planWeek } from "@/lib/data";
import { upcomingWeekdays } from "@/lib/domain";
import PlanWeekBoard from "@/components/PlanWeekBoard";

export default async function PlanWeekPage() {
  const session = await getSession();
  // A "SALES" teammate plans only their own visits; an ADMIN plans the
  // whole team's — same viewerOwnerId pattern as Pipeline/Dashboard.
  const viewerOwnerId = session!.role === "ADMIN" ? undefined : session!.userId;
  const { days, unscheduled } = await planWeek(session!.orgId, viewerOwnerId);
  const dates = upcomingWeekdays(5);

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5">
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Plan my week
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-dim)" }}>
          Suggested day-by-day, combining commercial priority (the same urgency score behind &quot;Reactivate today&quot;) with
          geographic proximity — contacts in the same city/area are grouped onto the same day. Not real route optimization, just a
          starting point: pick a day to turn it into a task and, if Google or Outlook Calendar is connected, a real calendar event
          with the address attached.
        </p>
      </div>
      <PlanWeekBoard days={days} unscheduled={unscheduled} dates={dates} />
    </div>
  );
}
