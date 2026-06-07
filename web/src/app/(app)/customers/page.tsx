import { getAuthContext, meetsOrgRole } from "@/lib/auth";
import { getOrgDb, withOrg } from "@/lib/db";
import type { Filter, ModuleConfig } from "@/lib/module/types";
import { customersConfig } from "@/modules/customers/config";
import { CustomersTable } from "./customers-table";

export const dynamic = "force-dynamic";

/** Distinct cities + tags for the filter dropdowns (org-scoped, capped). */
async function filterOptions(orgId: string) {
  const odb = getOrgDb(orgId);
  const [cityRows, tagRows] = await Promise.all([
    odb.customer.findMany({
      where: { city: { not: null } },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
      take: 100,
    }),
    withOrg(orgId, (tx) =>
      tx.$queryRaw<{ tag: string }[]>`
        SELECT DISTINCT unnest(tags) AS tag FROM "Customer" ORDER BY tag LIMIT 100`
    ),
  ]);
  const cities = cityRows
    .map((r) => r.city)
    .filter((c): c is string => !!c)
    .map((c) => ({ value: c, label: c }));
  const tags = tagRows.map((r) => ({ value: r.tag, label: r.tag }));
  return { cities, tags };
}

export default async function CustomersPage() {
  const { appRole, orgId } = await getAuthContext();
  const canMoney = meetsOrgRole(appRole, "admin");

  const { cities, tags } = orgId
    ? await filterOptions(orgId)
    : { cities: [], tags: [] };

  // Inject dynamic filter options; drop the COD column for non-owner/admin.
  const filters: Filter[] = customersConfig.filters.map((f) => {
    if (f.kind === "select" && f.key === "city") return { ...f, options: cities };
    if (f.kind === "select" && f.key === "tag") return { ...f, options: tags };
    return f;
  });
  const columns = canMoney
    ? customersConfig.columns
    : customersConfig.columns.filter((c) => c.key !== "codDelivered");

  const config: ModuleConfig = { ...customersConfig, filters, columns };

  return <CustomersTable config={config} role={appRole} />;
}
