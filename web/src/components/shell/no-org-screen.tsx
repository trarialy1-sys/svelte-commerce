"use client";

import { Building2 } from "lucide-react";
import { useTheme } from "next-themes";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export function NoOrgScreen() {
  const { resolvedTheme } = useTheme();
  const appearance = {
    baseTheme: resolvedTheme === "dark" ? dark : undefined,
    variables: { colorPrimary: resolvedTheme === "dark" ? "#6366f1" : "#4f46e5" },
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-card p-8 shadow-sm">
        <div className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
          <Building2 className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight">
            Aucune organisation active
          </h1>
          <p className="text-muted-foreground text-sm text-balance">
            Vous êtes connecté, mais aucune organisation n&apos;est active.
            Sélectionnez-en une pour continuer — ou contactez votre
            administrateur pour être invité.
          </p>
        </div>
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          appearance={appearance}
        />
        <UserButton appearance={appearance} />
      </div>
    </main>
  );
}
