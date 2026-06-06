import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Dev-only demo seed (npx prisma db seed).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma 7: the CLI (migrate dev / deploy, db push) uses this URL.
    // Neon's pooled connection can't run migrations, so point this at the
    // DIRECT (non-pooled) connection. The app runtime uses the pooled
    // DATABASE_URL via a driver adapter — wired up in chunk 0.3.
    url: env("DIRECT_URL"),
  },
});
