import "server-only";

import { getOrgDb } from "@/lib/db";
import type { ListParams, ListResult, ModuleConfig, Row } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const EXPORT_CAP = 5000;

export function parseListParams(
  sp: URLSearchParams,
  config: ModuleConfig
): ListParams {
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) ||
        DEFAULT_PAGE_SIZE
    )
  );
  const q = (sp.get("q") ?? "").trim();

  let sortField = config.defaultSort.field;
  let sortDir: "asc" | "desc" = config.defaultSort.dir;
  const sortRaw = sp.get("sort");
  if (sortRaw) {
    const [field, dir] = sortRaw.split(":");
    const sortable = config.columns.some((c) => c.key === field && c.sortable);
    if (sortable) {
      sortField = field;
      sortDir = dir === "asc" ? "asc" : "desc";
    }
  }

  const filters: Record<string, string> = {};
  for (const filter of config.filters) {
    if (filter.kind === "dateRange") {
      const from = sp.get(`${filter.key}_from`);
      const to = sp.get(`${filter.key}_to`);
      if (from) filters[`${filter.key}_from`] = from;
      if (to) filters[`${filter.key}_to`] = to;
    } else {
      const v = sp.get(filter.key);
      if (v) filters[filter.key] = v;
    }
  }

  return { page, pageSize, q, sortField, sortDir, filters };
}

export function buildWhere(
  config: ModuleConfig,
  params: ListParams
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...(config.baseWhere ?? {}) };

  for (const filter of config.filters) {
    if (filter.kind === "select") {
      const v = params.filters[filter.key];
      if (v) where[filter.key] = v;
    } else if (filter.kind === "boolean") {
      const v = params.filters[filter.key];
      if (v === "true" || v === "false") where[filter.key] = v === "true";
    } else if (filter.kind === "dateRange") {
      const from = params.filters[`${filter.key}_from`];
      const to = params.filters[`${filter.key}_to`];
      const range: Record<string, Date> = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      if (Object.keys(range).length) where[filter.key] = range;
    }
  }

  if (params.q && config.searchFields.length) {
    where.OR = config.searchFields.map((f) => ({
      [f]: { contains: params.q, mode: "insensitive" },
    }));
  }

  return where;
}

function buildOrderBy(params: ListParams): Record<string, "asc" | "desc"> {
  return { [params.sortField]: params.sortDir };
}

export async function listModule(
  orgId: string,
  config: ModuleConfig,
  params: ListParams
): Promise<ListResult> {
  const odb = getOrgDb(orgId);
  // Dynamic model access — isolate the `any` here. Always org-scoped via getOrgDb.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (odb as any)[config.model];
  const where = buildWhere(config, params);

  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      orderBy: buildOrderBy(params),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      ...(config.include ? { include: config.include } : {}),
    }),
    model.count({ where }),
  ]);

  return {
    rows: rows as Row[],
    total: total as number,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function exportRows(
  orgId: string,
  config: ModuleConfig,
  params: ListParams
): Promise<Row[]> {
  const odb = getOrgDb(orgId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (odb as any)[config.model];
  const where = buildWhere(config, params);
  const rows = await model.findMany({
    where,
    orderBy: buildOrderBy(params),
    take: EXPORT_CAP,
    ...(config.include ? { include: config.include } : {}),
  });
  return rows as Row[];
}
