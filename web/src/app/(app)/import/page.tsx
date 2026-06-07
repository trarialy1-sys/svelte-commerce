import { requireOrgRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  // Creates/edits data → operator+.
  await requireOrgRole("operator");
  return (
    <>
      <PageHeader
        title="Import"
        subtitle="Importez commandes, clients ou produits depuis un fichier Excel/CSV."
      />
      <ImportWizard />
    </>
  );
}
