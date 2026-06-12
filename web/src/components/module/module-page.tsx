"use client";

import * as React from "react";

import type { AppRole } from "@/lib/auth/roles";
import type { ModuleConfig, Row } from "@/lib/module/types";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/module/data-table";

interface ModulePageProps {
  config: ModuleConfig;
  role: AppRole | null;
  actions?: React.ReactNode;
  renderBulkExtra?: (ids: string[], clear: () => void) => React.ReactNode;
  groupBy?: (row: Row) => { key: string; label: string } | null;
}

export function ModulePage({
  config,
  role,
  actions,
  renderBulkExtra,
  groupBy,
}: ModulePageProps) {
  return (
    <>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={actions}
      />
      <React.Suspense fallback={null}>
        <DataTable
          config={config}
          role={role}
          renderBulkExtra={renderBulkExtra}
          groupBy={groupBy}
        />
      </React.Suspense>
    </>
  );
}
