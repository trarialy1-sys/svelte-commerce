import { Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Clients" subtitle="Base clients et segments." />
      <EmptyState
        icon={Users}
        title="Bientôt — module en construction"
        message="Le module Clients arrive dans un prochain chunk."
      />
    </>
  );
}
