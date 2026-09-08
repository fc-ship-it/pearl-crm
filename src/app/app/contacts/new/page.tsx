import { getSession } from "@/lib/auth";
import { listCompanies } from "@/lib/data";
import NewContactForm from "@/components/NewContactForm";

export default async function NewContactPage() {
  const session = await getSession();
  const companies = listCompanies(session!.orgId);

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        Add contact
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Enter details manually, scan a QR code, or import contacts straight from your phone.
      </p>
      <NewContactForm companyNames={companies.map((c) => c.name)} />
    </div>
  );
}
