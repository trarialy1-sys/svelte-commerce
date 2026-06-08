import { Document, Page, Text } from "@react-pdf/renderer";

import { Brand, ItemsTable, styles, type OrgBrand, type PdfItem } from "./layout";

export interface PackingOrder {
  code: string;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  tracking: string | null;
  items: PdfItem[];
}

/** Per-order packing slip — what goes in the box. */
export function PackingSlip({ org, order }: { org: OrgBrand; order: PackingOrder }) {
  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  return (
    <Document title={`Bon de préparation ${order.code}`}>
      <Page size="A4" style={styles.page}>
        <Brand org={org} title="Bon de préparation" />

        <Text style={[styles.bold, { fontSize: 13 }]}>Commande {order.code}</Text>
        {order.customerName ? <Text style={styles.meta}>{order.customerName}</Text> : null}
        {order.phone ? <Text style={styles.meta}>{order.phone}</Text> : null}
        {order.city ? <Text style={styles.meta}>{order.city}</Text> : null}
        {order.address ? <Text style={styles.meta}>{order.address}</Text> : null}
        {order.tracking ? <Text style={styles.meta}>Suivi : {order.tracking}</Text> : null}

        <Text style={styles.h2}>Articles</Text>
        <ItemsTable items={order.items} />
        <Text style={styles.muted}>Total articles : {totalQty}</Text>
      </Page>
    </Document>
  );
}
