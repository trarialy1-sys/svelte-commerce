import {
  BarChart3,
  Boxes,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  Package,
  Settings,
  ShieldCheck,
  Truck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum org role required to see this item. */
  minRole?: AppRole;
  /** Only visible to platform super-admins. */
  platformAdmin?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Outils",
    items: [
      { label: "Lot du jour", href: "/today", icon: CalendarCheck },
      { label: "Commandes", href: "/orders", icon: ClipboardList },
      { label: "Livraisons & BL", href: "/shipping", icon: Truck },
      { label: "Stock", href: "/stock", icon: Boxes },
      { label: "Catalogue", href: "/products", icon: Package },
      { label: "Clients", href: "/customers", icon: Users },
      { label: "Import", href: "/import", icon: Upload, minRole: "operator" },
      { label: "Finance", href: "/finance", icon: LineChart, minRole: "admin" },
      { label: "Rentabilité", href: "/finance/products", icon: LineChart, minRole: "admin" },
    ],
  },
  {
    label: "Plateforme",
    items: [
      { label: "Rapports", href: "/reports", icon: BarChart3, minRole: "admin" },
      { label: "Paramètres", href: "/settings", icon: Settings },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Admin", href: "/admin", icon: ShieldCheck, platformAdmin: true },
    ],
  },
];

const RANK: Record<AppRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

/** RBAC visibility: hide what the user can't open. */
export function canSee(
  item: NavItem,
  role: AppRole | null,
  isPlatformAdmin: boolean
): boolean {
  if (item.platformAdmin) return isPlatformAdmin;
  if (item.minRole) return role != null && RANK[role] >= RANK[item.minRole];
  return true;
}
