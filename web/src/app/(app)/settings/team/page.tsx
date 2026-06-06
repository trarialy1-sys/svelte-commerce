import { Users } from "lucide-react";

import { requireOrgRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function TeamSettingsPage() {
  // Admin-only. A member is redirected away by this guard.
  await requireOrgRole("admin");

  return (
    <>
      <PageHeader
        title="Équipe"
        subtitle="Membres et rôles de l'organisation."
      />
      <EmptyState
        icon={Users}
        title="Team — admin only"
        message="La gestion d'équipe (invitations, rôles) arrive dans un prochain chunk."
      />
    </>
  );
}
