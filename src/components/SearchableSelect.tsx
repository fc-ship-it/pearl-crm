"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SearchableOption = { id: string; label: string; sublabel?: string };

/**
 * A typeahead combobox that replaces a plain `<select>` wherever the list is
 * "every contact" (or every deal) — with dozens/hundreds of contacts, a
 * native dropdown means scrolling an alphabetical wall of names to find one.
 * This filters as you type (matches label + sublabel, e.g. a deal's linked
 * contact name), so typing a few letters of a name jumps straight to it.
 * Used by the quick-add Deal/Task forms, the new-meeting form, and the
 * custom-alert form — everywhere a contact or deal gets linked.
 *
 * The displayed text is DERIVED, never synced via effect: closed, it's
 * simply the selected option's label; open, it's the in-progress search
 * text (`editingText`, only ever set from event handlers). That keeps the
 * component correct even when the parent resets `value` out from under it
 * (e.g. clearing the form after submit) without a "set state in an effect"
 * footgun.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  emptyLabel,
  inputStyle,
  className = "w-full px-3 py-2 rounded-lg text-sm outline-none",
}: {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** When set, an always-visible first row (e.g. "No contact linked") that
   * clears the selection — omit for a required field with no "none" state. */
  emptyLabel?: string;
  inputStyle?: React.CSSProperties;
  className?: string;
}) {
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const displayValue = open ? editingText : (selected?.label ?? "");
  const q = (open ? editingText : "").trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
    : options;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const rows = emptyLabel ? filtered.length + 1 : filtered.length;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setEditingText(selected?.label ?? "");
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (emptyLabel && highlight === 0) {
        pick("");
      } else {
        const opt = filtered[emptyLabel ? highlight - 1 : highlight];
        if (opt) pick(opt.id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          ref={inputRef}
          value={displayValue}
          onChange={(e) => {
            setEditingText(e.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setEditingText(selected?.label ?? "");
            setOpen(true);
            setHighlight(0);
            inputRef.current?.select();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={className}
          style={{ ...inputStyle, paddingRight: 28 }}
        />
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-dim)" }} />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto z-50 rounded-lg"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(21,27,46,0.18)" }}
        >
          {emptyLabel && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick("")}
              className="w-full text-left px-3 py-2 text-sm"
              style={{ color: "var(--ink-dim)", background: highlight === 0 ? "var(--panel-2)" : "transparent" }}
            >
              {emptyLabel}
            </button>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--ink-dim)" }}>
              No matches.
            </div>
          )}
          {filtered.map((o, i) => {
            const rowIndex = emptyLabel ? i + 1 : i;
            return (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.id)}
                className="w-full text-left px-3 py-2 text-sm truncate"
                style={{ color: "var(--ink)", background: rowIndex === highlight ? "var(--panel-2)" : "transparent" }}
              >
                {o.label}
                {o.sublabel && (
                  <span className="ml-1.5 text-xs" style={{ color: "var(--ink-dim)" }}>
                    {o.sublabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
