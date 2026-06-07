-- AlterTable
ALTER TABLE "FinanceSettings" ADD COLUMN     "codCommissionPct" DECIMAL(5,2),
ADD COLUMN     "returnFee" DECIMAL(10,2),
ADD COLUMN     "shippingFeePerParcel" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Remittance_orgId_date_idx" ON "Remittance"("orgId", "date");

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security for the new tenant table (org-isolation policy, same as
-- the other tenant tables: enable + FORCE, keyed on app.current_org_id).
ALTER TABLE "Remittance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Remittance" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Remittance"
  USING ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
