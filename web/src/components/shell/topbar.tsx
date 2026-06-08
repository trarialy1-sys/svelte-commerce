"use client";

import { Bell } from "lucide-react";
import { useTheme } from "next-themes";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

import type { AppRole } from "@/lib/auth";
import { ModeToggle } from "@/components/mode-toggle";
import { CommandMenu } from "@/components/shell/command-menu";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopbarProps {
  role: AppRole | null;
  isPlatformAdmin: boolean;
}

export function Topbar({ role, isPlatformAdmin }: TopbarProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const clerkAppearance = {
    baseTheme: isDark ? dark : undefined,
    variables: { colorPrimary: isDark ? "#6366f1" : "#4f46e5" },
  };

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-[58px] shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="size-8" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <div className="flex flex-1 items-center">
        <CommandMenu role={role} isPlatformAdmin={isPlatformAdmin} />
      </div>

      <div className="flex items-center gap-1.5">
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <Bell className="size-4" />
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="text-muted-foreground px-2 py-6 text-center text-sm">
              Aucune notification
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          appearance={clerkAppearance}
        />
        <UserButton appearance={clerkAppearance} />
      </div>
    </header>
  );
}
