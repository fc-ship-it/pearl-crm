import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listOrgUsers } from "@/lib/data";
import TeamClient from "@/components/TeamClient";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/app/dashboard");

  const members = await listOrgUsers(session.orgId);

  return (
    <div className="max-w-[720px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Team
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Add the people who sell for you. A <strong>Sales</strong> teammate gets their own login and sees only the
        contacts and deals assigned to them, everywhere in Pearl; an <strong>Admin</strong> sees the whole
        team&apos;s pipeline, same as you. Each teammate connects their own Gmail/Outlook from Settings → Integrations once
        they log in — nothing here connects a mailbox on their behalf.
      </p>
      <TeamClient members={members} currentUserId={session.userId} />
    </div>
  );
}
