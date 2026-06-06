import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { getActiveOrgName, requireAuth } from "@/lib/auth";

// Authed dashboard reads live auth state — never prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Re-check on the server (the proxy is only a convenience gate).
  const { orgId, orgRole, appRole, isPlatformAdmin } = await requireAuth();

  // No active org → clean "select an organization" state, no crash.
  if (!orgId) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-card p-8">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            No active organization
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            Set an active organization
          </h1>
          <p className="text-balance text-sm text-muted-foreground">
            You&apos;re signed in but no organization is active. Pick one to
            continue. If you don&apos;t have an org yet, your administrator needs
            to invite you.
          </p>
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
          <UserButton />
        </div>
      </main>
    );
  }

  const orgName = await getActiveOrgName(orgId);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
        <UserButton />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Chunk 0.2 · Auth
        </span>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{orgName}</h1>
          <p className="font-mono text-sm text-muted-foreground">
            role: {appRole ?? "—"}{" "}
            <span className="text-foreground/40">({orgRole})</span>
            {isPlatformAdmin && (
              <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-primary">
                platform admin
              </span>
            )}
          </p>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href="/settings/team"
            className="rounded-md border border-border px-4 py-2 hover:bg-accent"
          >
            /settings/team (admin)
          </Link>
          <Link
            href="/admin"
            className="rounded-md border border-border px-4 py-2 hover:bg-accent"
          >
            /admin (platform)
          </Link>
        </nav>
      </section>
    </main>
  );
}
