/**
 * Dev-only seed: ~25 demo Customer rows for the first organization.
 * Run with: `npx prisma db seed` (configured in prisma.config.ts).
 *
 * Uses the generated client + pg adapter directly and sets the RLS GUC inside a
 * transaction so inserts pass the org-isolation policy.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, CustomerSegment } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const CITIES = [
  "Casablanca",
  "Marrakech",
  "Rabat",
  "Fès",
  "Tanger",
  "Agadir",
  "Meknès",
  "Oujda",
];
const FIRST = [
  "Youssef", "Fatima", "Mohamed", "Salma", "Khalid", "Imane", "Hamza", "Nadia",
  "Omar", "Sara", "Reda", "Aya", "Bilal", "Hanae", "Yassine", "Meryem",
];
const LAST = [
  "El Amrani", "Benani", "Tazi", "El Fassi", "Bennani", "Cherkaoui",
  "Idrissi", "Alaoui", "Berrada", "Saadi",
];

const SEGMENTS: CustomerSegment[] = [
  CustomerSegment.NOUVEAU,
  CustomerSegment.NOUVEAU,
  CustomerSegment.RECURRENT,
  CustomerSegment.RECURRENT,
  CustomerSegment.VIP,
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    console.error(
      "No organization found. Sign in to the app (or create an org) first."
    );
    process.exit(1);
  }
  const orgId = org.id;
  const now = Date.now();

  const customers = Array.from({ length: 25 }).map((_, i) => {
    const name = `${pick(FIRST, i)} ${pick(LAST, i * 3 + 1)}`;
    const phone = `06${String(10000000 + i * 372719).slice(0, 8)}`;
    const segment = pick(SEGMENTS, i);
    const ordersCount = (i * 7) % 23;
    const totalSpent = Number(((i * 137.5) % 4200).toFixed(2));
    // spread createdAt over the past ~120 days
    const createdAt = new Date(now - i * 5 * 24 * 60 * 60 * 1000);
    return {
      orgId,
      name,
      phone,
      city: pick(CITIES, i),
      segment,
      ordersCount,
      totalSpent,
      createdAt,
    };
  });

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    for (const c of customers) {
      await tx.customer.upsert({
        where: { orgId_phone: { orgId, phone: c.phone } },
        create: c,
        update: {},
      });
    }
  });

  console.log(`Seeded ${customers.length} customers for org "${org.name}" (${orgId}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
