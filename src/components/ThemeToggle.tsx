"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "pearl.theme";

/** Light/dark switch — every page under AppShell (including the Dashboard,
 * which is what was actually asked for) reads its colors from the CSS
 * variables in globals.css, so flipping data-theme on <html> re-themes the
 * whole app at once. The choice is saved per browser and re-applied before
 * paint by the inline script in layout.tsx, so there's no flash on reload. */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // best-effort only — the toggle still works for the rest of this visit
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
      style={{ border: "1px solid var(--border)", color: "var(--ink-dim)" }}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
