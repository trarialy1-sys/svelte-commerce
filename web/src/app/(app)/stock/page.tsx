import { Boxes } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function StockPage() {
  return (
    <>
      <PageHeader title="Stock" subtitle="Inventaire et mouvements de stock." />
      <EmptyState
        icon={Boxes}
        title="Bientôt — module en construction"
        message="Le module Stock arrive dans un prochain chunk."
      />
    </>
  );
}
