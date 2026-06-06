import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Platform super-admin only (env allowlist). Everyone else is redirected away.
  await requirePlatformAdmin();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        platform
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Platform admin</h1>
      <p className="text-sm text-muted-foreground">
        Placeholder. Visible only to user IDs in PLATFORM_ADMIN_USER_IDS.
      </p>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Back
      </Link>
    </main>
  );
}
