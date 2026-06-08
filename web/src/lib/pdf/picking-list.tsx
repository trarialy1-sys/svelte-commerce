import { Document, Page, Text, View } from "@react-pdf/renderer";

import { Brand, ItemsTable, styles, type OrgBrand, type PdfItem } from "./layout";

export interface PickingOrder {
  code: string;
  items: PdfItem[];
}

/**
 * Batched picking list off the ready queue: aggregated SKU pull-totals on top
 * (the warehouse efficiency win), per-order breakdown below (to sort picks back
 * into orders).
 */
export function PickingList({
  org,
  totals,
  orders,
}: {
  org: OrgBrand;
  totals: PdfItem[];
  orders: PickingOrder[];
}) {
  const totalUnits = totals.reduce((s, t) => s + t.qty, 0);
  return (
    <Document title="Liste de prélèvement">
      <Page size="A4" style={styles.page}>
        <Brand org={org} title="Liste de prélèvement" />
        <Text style={styles.meta}>
          {orders.length} commande(s) · {totalUnits} article(s) · {totals.length} SKU
        </Text>

        <Text style={styles.h2}>À prélever — total par SKU</Text>
        <ItemsTable items={totals} />

        <Text style={styles.h2}>Détail par commande</Text>
        {orders.map((o, i) => (
          <View key={`${o.code}-${i}`} wrap={false} style={{ marginBottom: 10 }}>
            <Text style={[styles.bold, { marginBottom: 2 }]}>{o.code}</Text>
            <ItemsTable items={o.items} />
          </View>
        ))}
      </Page>
    </Document>
  );
}
