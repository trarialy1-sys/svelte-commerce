"use client";

import * as React from "react";

import type { AppRole } from "@/lib/auth/roles";
import type { ModuleConfig } from "@/lib/module/types";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/module/data-table";

interface ModulePageProps {
  config: ModuleConfig;
  role: AppRole | null;
  actions?: React.ReactNode;
}

export function ModulePage({ config, role, actions }: ModulePageProps) {
  return (
    <>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={actions}
      />
      <React.Suspense fallback={null}>
        <DataTable config={config} role={role} />
      </React.Suspense>
    </>
  );
}
