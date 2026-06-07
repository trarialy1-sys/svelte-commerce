"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Package,
  Search,
  Users,
} from "lucide-react";

import { NAV, canSee } from "@/config/nav";
import type { AppRole } from "@/lib/auth";
import type { SearchGroup, SearchType } from "@/lib/search/search";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface CommandMenuProps {
  role: AppRole | null;
  isPlatformAdmin: boolean;
}

const TYPE_ICON: Record<SearchType, typeof ClipboardList> = {
  order: ClipboardList,
  customer: Users,
  product: Package,
  bl: FileText,
};

/** "X more →" deep links into each entity's filtered list view. */
function moreHref(type: SearchType, q: string): string {
  const e = encodeURIComponent(q);
  if (type === "order") return `/orders?q=${e}`;
  if (type === "customer") return `/customers?q=${e}`;
  if (type === "product") return `/products?q=${e}`;
  return `/shipping`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function CommandMenu({ role, isPlatformAdmin }: CommandMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const dq = useDebounced(query.trim(), 250);

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
      setQuery("");
      router.push(href);
    },
    [router]
  );

  // Live cross-entity search. TanStack Query keys on `dq`, so stale responses
  // from rapid typing are discarded (and the fetch is aborted via `signal`).
  const { data, isFetching } = useQuery<{ groups: SearchGroup[] }>({
    queryKey: ["search", dq],
    enabled: dq.length >= 2,
    staleTime: 10_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(dq)}`, { signal });
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
  });

  const ql = query.trim().toLowerCase();
  const navItems = NAV.flatMap((s) => s.items)
    .filter((i) => canSee(i, role, isPlatformAdmin))
    .filter((i) => !ql || i.label.toLowerCase().includes(ql));

  const actions = [
    { label: "Importer commandes", href: "/orders" },
    { label: "Créer un BL", href: "/shipping" },
  ].filter((a) => !ql || a.label.toLowerCase().includes(ql));

  const groups = data?.groups ?? [];
  const hasQuery = dq.length >= 2;
  const empty =
    navItems.length === 0 &&
    actions.length === 0 &&
    (!hasQuery || (!isFetching && groups.length === 0));

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

      {/* shouldFilter=false: we render server results as-is and filter nav/actions ourselves. */}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Commande, client, téléphone, SKU, tracking, BL…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {empty ? <CommandEmpty>Aucun résultat.</CommandEmpty> : null}

          {/* Entity results (grouped, ranked) */}
          {groups.map((g) => {
            const Icon = TYPE_ICON[g.type];
            return (
              <CommandGroup key={g.type} heading={`${g.label} (${g.total})`}>
                {g.results.map((r) => (
                  <CommandItem
                    key={`${r.type}:${r.id}`}
                    value={`${r.type}:${r.id}`}
                    onSelect={() => go(r.href)}
                  >
                    <Icon className="text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{r.title}</span>
                      {r.subtitle ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {r.subtitle}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
                {g.total > g.results.length ? (
                  <CommandItem
                    value={`${g.type}:more`}
                    onSelect={() => go(moreHref(g.type, dq))}
                    className="text-muted-foreground"
                  >
                    <ArrowRight />
                    <span>{g.total - g.results.length} de plus…</span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            );
          })}

          {groups.length > 0 && (navItems.length > 0 || actions.length > 0) ? (
            <CommandSeparator />
          ) : null}

          {navItems.length ? (
            <CommandGroup heading="Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`nav:${item.href}`}
                    onSelect={() => go(item.href)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {actions.length ? (
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem
                  key={a.label}
                  value={`action:${a.label}`}
                  onSelect={() => go(a.href)}
                >
                  <span>{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
