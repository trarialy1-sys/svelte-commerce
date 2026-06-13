import { requireOrgRole } from "@/lib/auth";
import { ExcelBLView } from "./excel-bl-view";

export const dynamic = "force-dynamic";

export default async function ExcelBLPage() {
  // Creates real OzonExpress parcels — operator+.
  await requireOrgRole("operator");
  return <ExcelBLView />;
}
