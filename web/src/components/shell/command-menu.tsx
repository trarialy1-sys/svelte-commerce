"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { NAV, canSee } from "@/config/nav";
import type { AppRole } from "@/lib/auth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface CommandMenuProps {
  role: AppRole | null;
  isPlatformAdmin: boolean;
}

export function CommandMenu({ role, isPlatformAdmin }: CommandMenuProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const navItems = NAV.flatMap((s) => s.items).filter((i) =>
    canSee(i, role, isPlatformAdmin)
  );

  const actions = [
    { label: "Nouvelle commande", href: "/orders" },
    { label: "Créer un BL", href: "/shipping" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground bg-muted/50 hover:bg-muted flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="bg-background text-muted-foreground pointer-events-none hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Rechercher une page ou une action…" />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Actions">
            {actions.map((a) => (
              <CommandItem
                key={a.label}
                value={a.label}
                onSelect={() => go(a.href)}
              >
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
