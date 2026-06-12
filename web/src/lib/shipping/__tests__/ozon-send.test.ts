import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Hard rule (3.4): never hit the live Ozon API — it creates REAL parcels and
// costs money. The vault is mocked so no creds are needed, and `fetch` is
// stubbed per-test with canned Ozon responses.
vi.mock("@/lib/integrations/vault", () => ({
  getCredentials: vi.fn(async () => ({ customerId: "cust", apiKey: "key" })),
}));

import { db, getOrgDb } from "@/lib/db";
import { createParcelForOrder } from "@/lib/shipping/ozon";

const ORG = "org_ozon_send";
let seq = 0;

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify(payload),
    }))
  );
}

async function newOrder(): Promise<string> {
  seq += 1;
  const odb = getOrgDb(ORG);
  // Receiver name comes from the linked customer (required to send).
  const customer = await odb.customer.create({
    data: { orgId: ORG, name: "Client Test", phone: `06990000${String(seq).padStart(2, "0")}` },
  });
  const order = await odb.order.create({
    data: {
      code: `OZ-${seq}`,
      cityId: 101, // resolved numeric Ozon city id (required to send)
      phone: `06120000${String(seq).padStart(2, "0")}`,
      address: "123 Rue de Test",
      totalPrice: 100,
      customerId: customer.id,
      items: { create: [{ orgId: ORG, sku: "SKU-1", qty: 1, unitPrice: 100 }] },
    },
  });
  return order.id;
}

beforeAll(async () => {
  await getOrgDb(ORG).orderItem.deleteMany({}).catch(() => {});
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.organization.create({ data: { id: ORG, name: "Ozon Org" } });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const odb = getOrgDb(ORG);
  await odb.parcel.deleteMany({});
  await odb.orderItem.deleteMany({});
  await odb.order.deleteMany({});
  await odb.customer.deleteMany({});
  await odb.auditLog.deleteMany({});
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

describe("createParcelForOrder (mocked Ozon)", () => {
  it("parses a nested TRACKING-NUMBER and persists the parcel", async () => {
    const orderId = await newOrder();
    // ADD-PARCEL → NEW-PARCEL → TRACKING-NUMBER (the real nesting).
    stubFetch({
      "ADD-PARCEL": {
        RESULT: "SUCCESS",
        "NEW-PARCEL": {
          "TRACKING-NUMBER": "TRK-NESTED-1",
          CITY_NAME: "Casablanca",
          PRICE: "100",
        },
      },
    });

    const res = await createParcelForOrder(ORG, orderId);

    expect(res.ok).toBe(true);
    expect(res.tracking).toBe("TRK-NESTED-1");
    expect(res.cityName).toBe("Casablanca");

    const parcel = await getOrgDb(ORG).parcel.findUnique({ where: { orderId } });
    expect(parcel?.tracking).toBe("TRK-NESTED-1");
    expect(parcel?.status).toBe("CREE");
  });

  it("routes 'Tracking Number Used Before' to the BL-only path (no parcel)", async () => {
    const orderId = await newOrder();
    stubFetch({
      "ADD-PARCEL": { RESULT: "ERROR", MESSAGE: "Tracking Number Used Before" },
    });

    const res = await createParcelForOrder(ORG, orderId);

    expect(res.ok).toBe(false);
    expect(res.usedBefore).toBe(true);
    // No parcel row should have been created for a used-before response.
    expect(await getOrgDb(ORG).parcel.findUnique({ where: { orderId } })).toBeNull();
  });

  it("fails cleanly on a generic Ozon error", async () => {
    const orderId = await newOrder();
    stubFetch({ "ADD-PARCEL": { RESULT: "ERROR", MESSAGE: "Invalid city" } });

    const res = await createParcelForOrder(ORG, orderId);

    expect(res.ok).toBe(false);
    expect(res.usedBefore).toBeFalsy();
    expect(res.error).toContain("Invalid city");
  });

  it("refuses to send when the city is unresolved (cityId null)", async () => {
    const order = await getOrgDb(ORG).order.create({
      data: { code: "OZ-NOCITY", phone: "0612345678", totalPrice: 50 },
    });
    // fetch must never be called — stub it to throw if it is.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch must not be called for an unresolved city");
      })
    );

    const res = await createParcelForOrder(ORG, order.id);
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.error).toMatch(/introuvable/i);
  });
});
