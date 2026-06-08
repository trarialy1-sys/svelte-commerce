import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface OrgBrand {
  name: string;
  logoUrl: string | null;
  brandColor: string;
}

export interface PdfItem {
  sku: string;
  name: string;
  qty: number;
}

export const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: "#222",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    paddingBottom: 10,
    marginBottom: 16,
  },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  docTitle: { fontSize: 12, color: "#666666" },
  bold: { fontFamily: "Helvetica-Bold" },
  meta: { color: "#555555", marginBottom: 2 },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#444444",
    marginTop: 16,
    marginBottom: 6,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
    paddingVertical: 4,
  },
  cellName: { flex: 1, paddingRight: 8 },
  cellSku: { width: 130, fontFamily: "Helvetica" },
  cellQty: { width: 44, textAlign: "right", fontFamily: "Helvetica-Bold" },
  muted: { color: "#888888", fontSize: 9, marginTop: 10 },
});

/** Shared branded header (org logo if set, else the org name in brand color). */
export function Brand({ org, title }: { org: OrgBrand; title: string }) {
  return (
    <View style={styles.header}>
      {org.logoUrl ? (
        // @react-pdf Image (not an HTML img — no alt attribute exists)
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={org.logoUrl} style={{ height: 30 }} />
      ) : (
        <Text style={[styles.brandName, { color: org.brandColor }]}>{org.name}</Text>
      )}
      <Text style={styles.docTitle}>{title}</Text>
    </View>
  );
}

/** A SKU/qty table with a header row. */
export function ItemsTable({ items }: { items: PdfItem[] }) {
  return (
    <View>
      <View style={styles.thead}>
        <Text style={styles.cellName}>Produit</Text>
        <Text style={styles.cellSku}>SKU</Text>
        <Text style={styles.cellQty}>Qté</Text>
      </View>
      {items.map((it, i) => (
        <View key={`${it.sku}-${i}`} style={styles.row}>
          <Text style={styles.cellName}>{it.name}</Text>
          <Text style={styles.cellSku}>{it.sku}</Text>
          <Text style={styles.cellQty}>{it.qty}</Text>
        </View>
      ))}
    </View>
  );
}
