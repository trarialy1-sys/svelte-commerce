-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "handle" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "shopifyInventoryItemId" TEXT,
ADD COLUMN     "shopifyVariantId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "stockState" TEXT NOT NULL DEFAULT 'EN_STOCK',
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Variant_orgId_stockState_idx" ON "Variant"("orgId", "stockState");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_orgId_shopifyVariantId_key" ON "Variant"("orgId", "shopifyVariantId");

