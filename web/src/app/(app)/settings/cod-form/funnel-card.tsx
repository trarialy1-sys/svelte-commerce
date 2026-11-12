import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Funnel, FunnelRow } from "@/lib/cod/stats";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10} %` : "—");
const dh = (cents: number) => `${Math.round(cents / 100).toLocaleString("fr-FR")} dh`;

function Rows({ title, rows }: { title: string; rows: FunnelRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead className="text-right">Ouvertures</TableHead>
            <TableHead className="text-right">Commencés</TableHead>
            <TableHead className="text-right">Commandes</TableHead>
            <TableHead className="text-right">Conversion</TableHead>
            <TableHead className="text-right">Chiffre</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="max-w-56 truncate">{r.key}</TableCell>
              <TableCell className="text-right">{r.opens}</TableCell>
              <TableCell className="text-right">{r.started}</TableCell>
              <TableCell className="text-right">{r.orders}</TableCell>
              <TableCell className="text-right">{pct(r.orders, r.opens)}</TableCell>
              <TableCell className="text-right">{dh(r.revenueCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Opens → started → orders over the last days (Releasit's analytics screen). */
export function FunnelCard({ funnel }: { funnel: Funnel }) {
  const t = funnel.total;
  const stats: [string, string][] = [
    ["Formulaires ouverts", String(t.opens)],
    ["Commencés (téléphone saisi)", String(t.started)],
    ["Commandes", String(t.orders)],
    ["Conversion", pct(t.orders, t.opens)],
    ["Chiffre", dh(t.revenueCents)],
    ["Avec offre / upsell", `${funnel.offerOrders} / ${funnel.upsellOrders}`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Statistiques ({funnel.days} jours)</CardTitle>
        <CardDescription>Ouvertures du formulaire, formulaires commencés et commandes, par produit et par source.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-md border p-2">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="font-medium">{value}</div>
            </div>
          ))}
        </div>
        <Rows title="Produit" rows={funnel.byProduct} />
        <Rows title="Source (utm_source)" rows={funnel.bySource} />
      </CardContent>
    </Card>
  );
}
