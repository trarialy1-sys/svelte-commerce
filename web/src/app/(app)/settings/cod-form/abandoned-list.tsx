import { Phone } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AbandonedForm } from "@/lib/cod/leads";

/** Forms with a phone number but no order (last 7 days), for call-backs. */
export function AbandonedList({ leads }: { leads: AbandonedForm[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formulaires abandonnés (7 jours)</CardTitle>
        <CardDescription>
          Visiteurs qui ont tapé leur téléphone sans valider. Une commande passée ensuite avec le même
          numéro les retire de la liste.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun formulaire abandonné.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => {
                  const wa = l.phone.replace(/\D/g, "");
                  return (
                    <TableRow key={l.leadId}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(l.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell>{l.name || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <a className="inline-flex items-center gap-1 underline" href={`tel:${l.phone}`}>
                          <Phone className="size-3" />
                          {l.phone}
                        </a>{" "}
                        <a className="text-muted-foreground underline" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                      </TableCell>
                      <TableCell>{l.city || "—"}</TableCell>
                      <TableCell>
                        {l.handle || "—"}
                        {l.quantity > 1 ? ` (x${l.quantity})` : ""}
                      </TableCell>
                      <TableCell>{l.utmSource ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
