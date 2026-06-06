import { Truck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function ShippingPage() {
  return (
    <>
      <PageHeader
        title="Livraisons & BL"
        subtitle="Colis, suivi et bons de livraison."
      />
      <EmptyState
        icon={Truck}
        title="Bientôt — module en construction"
        message="Le module Livraisons & BL arrive dans un prochain chunk."
      />
    </>
  );
}
