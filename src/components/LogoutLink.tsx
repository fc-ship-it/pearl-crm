"use client";

import { useRouter } from "next/navigation";

export default function LogoutLink() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-xs hover:opacity-80" style={{ color: "var(--ink-dim)" }}>
      Log out
    </button>
  );
}
