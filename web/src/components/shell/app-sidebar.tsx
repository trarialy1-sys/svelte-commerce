"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { NAV, canSee } from "@/config/nav";
import type { AppRole } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  orgName: string;
  role: AppRole | null;
  isPlatformAdmin: boolean;
}

export function AppSidebar({ orgName, role, isPlatformAdmin }: AppSidebarProps) {
  const pathname = usePathname();
  const initials = orgName.slice(0, 2).toUpperCase();
  // Folded sections the user opened by hand (they also open on their own
  // when the current page lives inside them).
  const [opened, setOpened] = React.useState<Record<string, boolean>>({});
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1.5">
          <div className="bg-primary text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold">
            {initials}
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">{orgName}</span>
            <span className="text-muted-foreground truncate text-xs">
              Partner OS
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((section) => {
          const items = section.items.filter((i) =>
            canSee(i, role, isPlatformAdmin)
          );
          if (items.length === 0) return null;
          const open =
            !section.collapsed ||
            (opened[section.label] ?? items.some((i) => isActive(i.href)));
          return (
            <SidebarGroup key={section.label}>
              {section.collapsed ? (
                <SidebarGroupLabel asChild>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setOpened((o) => ({ ...o, [section.label]: !open }))
                    }
                    className="hover:text-sidebar-foreground flex w-full cursor-pointer items-center justify-between"
                  >
                    <span>
                      {section.label} ({items.length})
                    </span>
                    <ChevronRight
                      className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  </button>
                </SidebarGroupLabel>
              ) : (
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              )}
              {open ? (
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
              ) : null}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
