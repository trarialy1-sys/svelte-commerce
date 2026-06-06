import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Commandes" subtitle="Gestion et confirmation des commandes." />
      <EmptyState
        icon={ClipboardList}
        title="Bientôt — module en construction"
        message="Le module Commandes arrive dans un prochain chunk."
      />
    </>
  );
}
