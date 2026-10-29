import { getAuthContext } from "@/lib/auth";
import { getOrgDb } from "@/lib/db";
import { CountView, type CountProduct } from "./count-view";

export const dynamic = "force-dynamic";

export default async function CountPage() {
  const { orgId, appRole } = await getAuthContext();
  if (!orgId) return <CountView products={[]} role={appRole} />;

  const variants = await getOrgDb(orgId).variant.findMany({
    where: { tracked: true },
    select: {
      id: true,
      sku: true,
      optionLabel: true,
      inventoryQty: true,
      lastCountedAt: true,
      lastCountedBy: true,
      countNote: true,
      product: { select: { id: true, title: true, imageUrl: true, status: true } },
    },
    orderBy: [{ productId: "asc" }, { sku: "asc" }],
    take: 5000,
  });

  const byProduct = new Map<string, CountProduct>();
  for (const v of variants) {
    let p = byProduct.get(v.product.id);
    if (!p) {
      p = {
        id: v.product.id,
        title: v.product.title,
        image: v.product.imageUrl,
        active: v.product.status === "active",
        variants: [],
      };
      byProduct.set(p.id, p);
    }
    p.variants.push({
      id: v.id,
      sku: v.sku,
      label: v.optionLabel ?? "",
      qty: v.inventoryQty,
      countedAt: v.lastCountedAt?.toISOString() ?? null,
      countedBy: v.lastCountedBy,
      note: v.countNote,
    });
  }
  // Active products first, then by name.
  const products = [...byProduct.values()].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title, "fr")
  );
  return <CountView products={products} role={appRole} />;
}
