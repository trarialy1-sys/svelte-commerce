import Link from "next/link";
import { Plug, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/settings/integrations",
    title: "Intégrations",
    description: "Connectez Shopify et OzonExpress (clés chiffrées).",
    icon: Plug,
  },
  {
    href: "/settings/team",
    title: "Équipe",
    description: "Membres et rôles de l'organisation.",
    icon: Users,
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration de l'organisation." />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.href}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link href={s.href}>Ouvrir</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
