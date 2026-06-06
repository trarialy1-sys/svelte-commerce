import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter. The app uses the pooled DATABASE_URL
// (Neon pooler in prod, local Postgres in dev/CI). The pool connects lazily,
// so importing this module never opens a connection at build time.
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { __db?: PrismaClient };

/**
 * Base Prisma client (singleton). NOT org-scoped.
 *
 * Tool/feature code must NOT import this for tenant data — always use
 * `getOrgDb(orgId)`. `db` is only for non-tenant models (Organization, User,
 * CityCatalog) and infrastructure (webhooks, JIT sync).
 */
export const db = globalForPrisma.__db ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.__db = db;
