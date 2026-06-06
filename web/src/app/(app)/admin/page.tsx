import { ShieldCheck } from "lucide-react";

import { requirePlatformAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function AdminPage() {
  // Platform super-admin only (env allowlist). Everyone else is redirected away.
  await requirePlatformAdmin();

  return (
    <>
      <PageHeader
        title="Admin plateforme"
        subtitle="Outils super-administrateur."
      />
      <EmptyState
        icon={ShieldCheck}
        title="Platform admin"
        message="Visible uniquement aux IDs dans PLATFORM_ADMIN_USER_IDS. Outils plateforme à venir."
      />
    </>
  );
}
