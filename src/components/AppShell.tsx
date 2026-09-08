"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Video,
  Megaphone,
  Plug,
  CreditCard,
  LogOut,
  BarChart3,
} from "lucide-react";
import ReminderNotifier from "@/components/ReminderNotifier";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/meetings", label: "AI Meetings", icon: Video },
  { href: "/app/campaigns", label: "Campaigns & alerts", icon: Megaphone },
  { href: "/app/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/app/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/app/settings/billing", label: "Plan & billing", icon: CreditCard },
];

export default function AppShell({
  children,
  userName,
  orgName,
  trialDaysLeft,
  plan,
}: {
  children: React.ReactNode;
  userName: string;
  orgName: string;
  trialDaysLeft: number;
  plan: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      <aside className="w-[220px] shrink-0 border-r flex flex-col" style={{ borderColor: "var(--border)" }}>
        <div className="h-16 flex items-center gap-2 px-5 border-b" style={{ borderColor: "var(--border)" }}>
          <Image src="/brand/pearl-logo-64.png" alt="" width={22} height={22} />
          <span className="font-display text-sm tracking-wide" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition"
                style={
                  active
                    ? {
                        background: "linear-gradient(90deg, rgba(212,168,67,0.18), rgba(255,46,166,0.12))",
                        color: "var(--ink)",
                        border: "1px solid rgba(212,168,67,0.35)",
                      }
                    : { color: "var(--ink-dim)" }
                }
              >
                <Icon size={17} color={active ? "var(--gold)" : "var(--ink-dim)"} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          {plan === "trial" && (
            <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
              Free trial:{" "}
              <span style={{ color: trialDaysLeft <= 2 ? "var(--danger)" : "var(--gold)" }}>
                {trialDaysLeft > 0 ? `${trialDaysLeft} days left` : "expired"}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80"
            style={{ color: "var(--ink-dim)" }}
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-16 shrink-0 flex items-center justify-between px-6 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-sm" style={{ color: "var(--ink-dim)" }}>
            {orgName}
          </div>
          <div className="flex items-center gap-4">
            <ReminderNotifier />
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--gold)", color: "var(--ink)" }}
              >
                {userName
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <span className="text-sm" style={{ color: "var(--ink)" }}>
                {userName}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
