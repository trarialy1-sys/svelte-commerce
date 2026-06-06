import Link from "next/link";
import { requireOrgRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  // Admin-only. A member is redirected away by this guard.
  await requireOrgRole("admin");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        settings / team
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Team — admin only</h1>
      <p className="text-sm text-muted-foreground">
        Placeholder. Real team management arrives in a later chunk.
      </p>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Back
      </Link>
    </main>
  );
}
