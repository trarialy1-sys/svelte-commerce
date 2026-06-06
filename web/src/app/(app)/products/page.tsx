import { Package } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Produits et variantes." />
      <EmptyState
        icon={Package}
        title="Bientôt — module en construction"
        message="Le module Catalogue arrive dans un prochain chunk."
      />
    </>
  );
}
