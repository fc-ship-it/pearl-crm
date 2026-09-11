"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Small delete icon used both inline in the contacts table and on the
 * contact detail page. Asks for confirmation with a native `confirm()`
 * (no custom modal needed for something this destructive-but-rare), then
 * calls the DELETE endpoint and refreshes the list/page.
 *
 * `redirectTo` is used on the detail page — after deleting the contact
 * you're currently looking at, there's no page left to refresh, so we
 * navigate away instead.
 */
export default function DeleteContactButton({
  contactId,
  contactName,
  redirectTo,
  size = "sm",
}: {
  contactId: string;
  contactName: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      // Auto-reset the "are you sure" state if they don't confirm within a
      // few seconds, so a stray later click doesn't delete by surprise.
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    startTransition(async () => {
      await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  const dim = size === "sm" ? 14 : 16;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={confirming ? `Click again to permanently delete ${contactName}` : `Delete ${contactName}`}
      className="inline-flex items-center gap-1 rounded-lg transition"
      style={{
        padding: size === "sm" ? "4px 6px" : "6px 10px",
        color: confirming ? "var(--danger, #e5484d)" : "var(--ink-dim)",
        background: confirming ? "rgba(229,72,77,0.12)" : "transparent",
        opacity: isPending ? 0.5 : 1,
        fontSize: 11,
      }}
    >
      <Trash2 size={dim} />
      {confirming && <span className="whitespace-nowrap">Confirm?</span>}
    </button>
  );
}
