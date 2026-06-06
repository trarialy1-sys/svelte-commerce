-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "note" TEXT,
ADD COLUMN     "shopifyOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orgId_shopifyOrderId_key" ON "Order"("orgId", "shopifyOrderId");

