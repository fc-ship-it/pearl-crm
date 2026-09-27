"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n";

const LOCALE_KEY = "pearl.locale";

/**
 * Language switch — EN/IT/AR for now (French isn't in scope). Unlike
 * <ThemeToggle> this can't just flip a CSS variable: the translated text
 * comes from server components (Dashboard, Statistics, the nav) that read
 * the user's saved locale from the DB, so choosing a language here saves it
 * via the API and then does a router.refresh() to re-render those pages in
 * the new language. `dir`/`lang` on <html> are applied immediately (and kept
 * in sync on every render) so Arabic's right-to-left layout never waits on
 * the network round-trip.
 */
export default function LanguageSwitcher({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // best-effort only
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    setPending(true);
    await fetch("/api/settings/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
    router.refresh();
    setPending(false);
  }

  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Language"
        aria-label="Language"
        disabled={pending}
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold disabled:opacity-60"
        style={{ border: "1px solid var(--border)", color: "var(--ink-dim)" }}
      >
        {current.id.toUpperCase()}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-[170px] z-50 rounded-xl overflow-hidden"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(21,27,46,0.18)" }}
        >
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => choose(l.id)}
              className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between"
              style={{ color: "var(--ink)", background: l.id === locale ? "var(--panel-2)" : "transparent" }}
              dir={l.dir}
            >
              <span>{l.nativeLabel}</span>
              {l.id === locale && <span style={{ color: "var(--gold)" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
