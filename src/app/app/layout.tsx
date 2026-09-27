import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrganization, isAccessBlocked } from "@/lib/data";
import { resolveUserLocale } from "@/lib/i18n-server";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const org = await getOrganization(session.orgId);
  if (!org) redirect("/login");
  if (isAccessBlocked(org)) redirect("/billing-required");

  const trialDaysLeft = Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / (24 * 3600 * 1000));
  const locale = await resolveUserLocale(session.userId);

  return (
    <AppShell
      userName={session.name}
      orgName={org.name}
      trialDaysLeft={trialDaysLeft}
      plan={org.plan}
      isAdmin={session.role === "ADMIN"}
      locale={locale}
    >
      {children}
    </AppShell>
  );
}
