"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sendTestDigestAction, setDigestOptInAction } from "../actions";

export function DigestCard({
  optIn,
  emailConfigured,
}: {
  optIn: boolean;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [checked, setChecked] = React.useState(optIn);

  function toggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const res = await setDigestOptInAction(next);
      if (res.ok) {
        toast.success(next ? "Abonné au résumé quotidien." : "Désabonné.");
        router.refresh();
      } else {
        setChecked(!next);
        toast.error(res.message ?? "Échec.");
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const res = await sendTestDigestAction();
      if (res.ok) toast.success(res.message ?? "Test envoyé.");
      else toast.error(res.message ?? "Échec.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
            <Mail className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Résumé quotidien</CardTitle>
            <CardDescription>
              Un e-mail chaque matin (~07:30) aux propriétaires/admins : pouls du
              jour, à traiter, COD.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={checked}
            disabled={pending}
            onCheckedChange={(v) => toggle(v === true)}
          />
          Recevoir le résumé quotidien
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={sendTest} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Envoyer un test
          </Button>
          {!emailConfigured ? (
            <span className="text-muted-foreground text-xs">
              E-mail non configuré (RESEND_API_KEY + domaine vérifié).
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
