// Builds the "export everything" workbook for the Owner Dashboard. Kept as
// its own module (rather than inline in the API route) so the sheet layout
// can be unit-tested or reused later (e.g. a per-organization export) without
// touching the route.
import ExcelJS from "exceljs";
import { listAllOrganizations, listAllUsers, listAllContacts } from "@/lib/data";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF151B2E" } };
  row.alignment = { vertical: "middle" };
}

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 48);
  });
}

/** Builds the full cross-tenant export (Clienti / Utenti / Contatti) as an xlsx buffer. */
export async function buildOwnerExportWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pearl";
  workbook.created = new Date();

  const orgs = listAllOrganizations();
  const users = listAllUsers();
  const contacts = listAllContacts();

  const clienti = workbook.addWorksheet("Clienti");
  clienti.columns = [
    { header: "Azienda", key: "name" },
    { header: "Piano", key: "plan" },
    { header: "Prova scade", key: "trialEndsAt" },
    { header: "Giorni bonus prova", key: "promoBonusDays" },
    { header: "Utenti", key: "userCount" },
    { header: "Contatti", key: "contactCount" },
    { header: "Trattative", key: "dealCount" },
    { header: "Registrata il", key: "createdAt" },
  ];
  styleHeader(clienti.getRow(1));
  for (const o of orgs) {
    clienti.addRow({
      name: o.name,
      plan: o.plan,
      trialEndsAt: fmtDate(o.trialEndsAt),
      promoBonusDays: o.promoBonusDays,
      userCount: o.userCount,
      contactCount: o.contactCount,
      dealCount: o.dealCount,
      createdAt: fmtDate(o.createdAt),
    });
  }
  autoWidth(clienti);

  const utenti = workbook.addWorksheet("Utenti");
  utenti.columns = [
    { header: "Nome", key: "name" },
    { header: "Email", key: "email" },
    { header: "Azienda", key: "orgName" },
    { header: "Ruolo", key: "role" },
    { header: "Registrato il", key: "createdAt" },
  ];
  styleHeader(utenti.getRow(1));
  for (const u of users) {
    utenti.addRow({
      name: u.name,
      email: u.email,
      orgName: u.orgName,
      role: u.role,
      createdAt: fmtDate(u.createdAt),
    });
  }
  autoWidth(utenti);

  const contattiSheet = workbook.addWorksheet("Contatti");
  contattiSheet.columns = [
    { header: "Azienda cliente", key: "orgName" },
    { header: "Nome contatto", key: "name" },
    { header: "Email", key: "email" },
    { header: "Telefono", key: "phone" },
    { header: "Azienda del contatto", key: "companyName" },
    { header: "Interesse", key: "interest" },
    { header: "Fascia budget", key: "budgetTier" },
    { header: "Segmento target", key: "targetSegment" },
    { header: "Temperatura lead", key: "temperature" },
    { header: "Origine", key: "source" },
    { header: "Creato il", key: "createdAt" },
  ];
  styleHeader(contattiSheet.getRow(1));
  for (const c of contacts) {
    contattiSheet.addRow({
      orgName: c.orgName,
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      companyName: c.companyName || "",
      interest: c.interest || "",
      budgetTier: c.budgetTier || "",
      targetSegment: c.targetSegment || "",
      temperature: c.temperature || "",
      source: c.source,
      createdAt: fmtDate(c.createdAt),
    });
  }
  autoWidth(contattiSheet);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
