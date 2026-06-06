import Link from "next/link";
import { Settings, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Configuration de l'organisation."
        actions={
          <Button asChild variant="outline">
            <Link href="/settings/team">
              <Users className="size-4" />
              Équipe
            </Link>
          </Button>
        }
      />
      <EmptyState
        icon={Settings}
        title="Bientôt — module en construction"
        message="Les paramètres de l'organisation arrivent dans un prochain chunk."
      />
    </>
  );
}
