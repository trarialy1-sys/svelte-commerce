-- Phase 4.2 — cost inputs (landed cost, confirmation cost, ad spend)
ALTER TABLE "Variant" ADD COLUMN     "freightCost" DECIMAL(10,2);
ALTER TABLE "FinanceSettings" ADD COLUMN     "confirmationCostPerOrder" DECIMAL(10,2);

CREATE TYPE "AdSpendSource" AS ENUM ('MANUAL', 'META');

CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "variantId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "source" "AdSpendSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdSpend_orgId_periodStart_idx" ON "AdSpend"("orgId", "periodStart");
CREATE INDEX "AdSpend_orgId_variantId_idx" ON "AdSpend"("orgId", "variantId");

ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
