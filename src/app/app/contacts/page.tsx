import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listContacts } from "@/lib/data";
import { formatCurrency, relativeDaysLabel, initials, avatarColor, budgetTierConfig, contactSourceConfig } from "@/lib/domain";
import { Plus, Filter } from "lucide-react";
import LeadTemperaturePicker from "@/components/LeadTemperaturePicker";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ interest?: string; budgetTier?: string; targetSegment?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const filters = {
    interest: sp.interest || undefined,
    budgetTier: sp.budgetTier || undefined,
    targetSegment: sp.targetSegment || undefined,
  };
  const contacts = await listContacts(session!.orgId, filters);
  const allContacts = await listContacts(session!.orgId);
  const segments = Array.from(new Set(allContacts.map((c) => c.targetSegment).filter(Boolean))) as string[];
  const hasFilters = !!(filters.interest || filters.budgetTier || filters.targetSegment);

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

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Contact", "Company", "Qualification", "Lead", "Open deals", "Value", "Last interaction"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-normal whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const tier = budgetTierConfig(c.budgetTier);
              const src = contactSourceConfig(c.source);
              return (
                <tr key={c.id} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: avatarColor(c.name), color: "var(--ink)" }}
                      >
                        {initials(c.name)}
                      </div>
                      <div>
                        <div style={{ color: "var(--ink)" }}>{c.name}</div>
                        <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                          {c.email}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                    {c.companyName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.targetSegment && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--panel-2)", color: "var(--ink-dim)" }}>
                          {c.targetSegment}
                        </span>
                      )}
                      {tier && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: `${tier.color}22`, color: tier.color }}>
                          {tier.label} budget
                        </span>
                      )}
                    </div>
                    {c.interest && (
                      <div className="text-xs mt-1" style={{ color: "var(--ink-dim)" }}>
                        {c.interest}
                      </div>
                    )}
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--ink-dim)", opacity: 0.7 }}>
                      {src.label}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <LeadTemperaturePicker contactId={c.id} value={c.temperature} size="sm" />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-dim)" }}>
                    {c.dealCount || 0}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: "var(--gold)" }}>
                    {formatCurrency(c.dealValue || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-dim)" }}>
                    {c.lastInteractionAt ? relativeDaysLabel(c.lastInteractionAt) : "—"}
                  </td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--ink-dim)" }}>
                  No contacts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
