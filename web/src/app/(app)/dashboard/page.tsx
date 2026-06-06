import { LayoutDashboard } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de votre activité."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Bientôt — module en construction"
        message="Le tableau de bord avec vos KPIs arrive dans un prochain chunk."
      />
    </>
  );
}
