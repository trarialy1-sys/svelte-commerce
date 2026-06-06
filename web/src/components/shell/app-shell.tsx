"use client";

import type { AppRole } from "@/lib/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";

interface AppShellProps {
  orgName: string;
  role: AppRole | null;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}

export function AppShell({
  orgName,
  role,
  isPlatformAdmin,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar orgName={orgName} role={role} isPlatformAdmin={isPlatformAdmin} />
      <SidebarInset>
        <Topbar role={role} isPlatformAdmin={isPlatformAdmin} />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
