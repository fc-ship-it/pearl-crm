import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listContacts } from "@/lib/data";
import { Plus, Filter } from "lucide-react";
import ContactsTable from "@/components/ContactsTable";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ interest?: string; budgetTier?: string; targetSegment?: string; rawImports?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const filters = {
    interest: sp.interest || undefined,
    budgetTier: sp.budgetTier || undefined,
    targetSegment: sp.targetSegment || undefined,
    rawImportsOnly: sp.rawImports === "1",
  };
  const contacts = await listContacts(session!.orgId, filters);
  const allContacts = await listContacts(session!.orgId);
  const segments = Array.from(new Set(allContacts.map((c) => c.targetSegment).filter(Boolean))) as string[];
  const hasFilters = !!(filters.interest || filters.budgetTier || filters.targetSegment || filters.rawImportsOnly);

  const inputStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" } as const;

  return (
    <div className="max-w-[1200px]">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="font-display text-xl" style={{ color: "var(--ink)" }}>
          Contacts
        </h1>
        <Link
          href="/app/contacts/new"
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          <Plus size={16} /> Add contact
        </Link>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--ink-dim)" }}>
        A unified directory with the full history of every interaction. Add contacts manually, by scanning a QR code, or by importing them from your phone.
      </p>

      <form className="card p-3 mb-4 flex flex-wrap items-center gap-2" style={{ background: "var(--panel-2)" }}>
        <Filter size={14} color="var(--ink-dim)" />
        <input name="interest" defaultValue={filters.interest} placeholder="Filter by interest…" className="px-3 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
        <select name="budgetTier" defaultValue={filters.budgetTier || ""} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={inputStyle}>
          <option value="">All budget tiers</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select name="targetSegment" defaultValue={filters.targetSegment || ""} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={inputStyle}>
          <option value="">All target segments</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs px-2" style={{ color: "var(--ink-dim)" }} title="No company, interest, budget tier or target segment set — the signature of a raw phone import via the Contact Picker, as opposed to a demo/manually-entered contact.">
          <input type="checkbox" name="rawImports" value="1" defaultChecked={filters.rawImportsOnly} />
          Only phone imports (no company/tags)
        </label>
        <button type="submit" className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--gold)", color: "var(--ink)" }}>
          Apply
        </button>
        {hasFilters && (
          <Link href="/app/contacts" className="text-xs" style={{ color: "var(--cyan)" }}>
            Clear filters
          </Link>
        )}
        <span className="text-xs ml-auto" style={{ color: "var(--ink-dim)" }}>
          {contacts.length} contact{contacts.length === 1 ? "" : "s"}
        </span>
      </form>

      <ContactsTable contacts={contacts} />
    </div>
  );
}
