"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/owner/logout", { method: "POST" });
        router.push("/owner/login");
        router.refresh();
      }}
      className="px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink-dim)" }}
    >
      Esci
    </button>
  );
}
