"use client";

import { useRouter } from "next/navigation";

import type { AppRole } from "@/lib/auth/roles";
import type { ModuleConfig, Row } from "@/lib/module/types";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/module/data-table";

export function CustomersTable({
  config,
  role,
}: {
  config: ModuleConfig;
  role: AppRole | null;
}) {
  const router = useRouter();
  return (
    <>
      <PageHeader title={config.title} subtitle={config.subtitle} />
      <DataTable
        config={config}
        role={role}
        onRowClick={(row: Row) => router.push(`/customers/${row.id as string}`)}
      />
    </>
  );
}
