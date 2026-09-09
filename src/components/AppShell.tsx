"use client";

import { useState } from "react";
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
  Menu,
  X,
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

/**
 * The permanent 220px sidebar this used to always render was the main thing
 * making the installed phone app "not optimized at all" — on a ~375-430px
 * screen it left almost no room for actual content. Below the `md` breakpoint
 * it's now replaced by a slim top bar + a full-screen slide-in menu; nothing
 * changes above `md` (tablet/desktop keeps the original permanent sidebar).
 */
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
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );

  const trialBadge = plan === "trial" && (
    <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
      Free trial:{" "}
      <span style={{ color: trialDaysLeft <= 2 ? "var(--danger)" : "var(--gold)" }}>
        {trialDaysLeft > 0 ? `${trialDaysLeft} days left` : "expired"}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* Desktop/tablet sidebar — unchanged, hidden below md */}
      <aside className="hidden md:flex w-[220px] shrink-0 border-r flex-col" style={{ borderColor: "var(--border)" }}>
        <div className="h-16 flex items-center gap-2 px-5 border-b" style={{ borderColor: "var(--border)" }}>
          <Image src="/brand/pearl-logo-64.png" alt="" width={22} height={22} />
          <span className="font-display text-sm tracking-wide" style={{ color: "var(--ink)" }}>
            PEARL
          </span>
        </div>
        {navLinks()}
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          {trialBadge}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80"
            style={{ color: "var(--ink-dim)" }}
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile slide-in menu + backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(21,27,46,0.5)" }} onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[80vw] max-w-[280px] flex flex-col" style={{ background: "var(--panel)" }}>
            <div className="h-16 shrink-0 flex items-center justify-between gap-2 px-5 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <Image src="/brand/pearl-logo-64.png" alt="" width={22} height={22} />
                <span className="font-display text-sm tracking-wide" style={{ color: "var(--ink)" }}>
                  PEARL
                </span>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={20} color="var(--ink-dim)" />
              </button>
            </div>
            {navLinks(() => setMenuOpen(false))}
            <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
              {trialBadge}
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80"
                style={{ color: "var(--ink-dim)" }}
              >
                <LogOut size={16} /> Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-16 shrink-0 flex items-center justify-between px-4 md:px-6 border-b gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden shrink-0" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={22} color="var(--ink)" />
            </button>
            <div className="text-sm truncate" style={{ color: "var(--ink-dim)" }}>
              {orgName}
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <ReminderNotifier />
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: "var(--gold)", color: "var(--ink)" }}
              >
                {initials}
              </div>
              <span className="text-sm hidden sm:inline" style={{ color: "var(--ink)" }}>
                {userName}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
