import { LineChart } from "lucide-react";

import { requireOrgRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function FinancePage() {
  // Admin-only module.
  await requireOrgRole("admin");

  return (
    <>
      <PageHeader title="Finance" subtitle="Revenus, coûts et marges." />
      <EmptyState
        icon={LineChart}
        title="Bientôt — module en construction"
        message="Le module Finance arrive dans un prochain chunk."
      />
    </>
  );
}
