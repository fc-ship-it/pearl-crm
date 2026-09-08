import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth";
import { buildOwnerExportWorkbook } from "@/lib/export";

export const runtime = "nodejs";

export async function GET() {
  const isOwner = await getOwnerSession();
  if (!isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buffer = await buildOwnerExportWorkbook();
  const filename = `pearl-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
