import { BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Rapports" subtitle="Exports et analyses." />
      <EmptyState
        icon={BarChart3}
        title="Bientôt — module en construction"
        message="Le module Rapports arrive dans un prochain chunk."
      />
    </>
  );
}
