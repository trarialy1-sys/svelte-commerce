/*
  Warnings:

  - You are about to drop the `Health` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('SHOPIFY', 'OZON', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NOUVELLE', 'CONFIRMEE', 'ANNULEE', 'REPORTEE', 'PAS_DE_REPONSE', 'INJOIGNABLE', 'NUMERO_ERRONE', 'DOUBLON', 'HORS_ZONE');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('SHOPIFY', 'IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('CREE', 'RAMASSE', 'EN_TRANSIT', 'LIVRE', 'RETOURNE', 'REFUSE');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('NOUVEAU', 'RECURRENT', 'VIP');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('DRAFT', 'SAVED');

-- DropTable
DROP TABLE "Health";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "brandColor" TEXT NOT NULL DEFAULT '#C1542D',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "credentialsEnc" TEXT,
    "meta" JSONB,
    "connectedAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shopifyId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2),
    "inventoryQty" INTEGER NOT NULL DEFAULT 0,
    "tracked" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "segment" "CustomerSegment" NOT NULL DEFAULT 'NOUVEAU',
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "firstOrderAt" TIMESTAMP(3),
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT,
    "cityRaw" TEXT,
    "cityId" INTEGER,
    "address" TEXT,
    "phone" TEXT,
    "totalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'NOUVELLE',
    "source" "OrderSource" NOT NULL DEFAULT 'MANUAL',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "callbackAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tracking" TEXT,
    "ozonCityId" INTEGER,
    "codPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "ParcelStatus" NOT NULL DEFAULT 'CREE',
    "shippingFee" DECIMAL(10,2),
    "returnFee" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "parcelCount" INTEGER NOT NULL DEFAULT 0,
    "pdfUrl" TEXT,
    "labelsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteParcel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,

    CONSTRAINT "DeliveryNoteParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityCatalog" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "raw" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityAlias" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "ozonCityId" INTEGER NOT NULL,

    CONSTRAINT "CityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeighAlias" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ozonCityId" INTEGER NOT NULL,

    CONSTRAINT "NeighAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "defaultShippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "returnCost" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE INDEX "Integration_orgId_idx" ON "Integration"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_orgId_provider_key" ON "Integration"("orgId", "provider");

-- CreateIndex
CREATE INDEX "Product_orgId_idx" ON "Product"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_shopifyId_key" ON "Product"("orgId", "shopifyId");

-- CreateIndex
CREATE INDEX "Variant_orgId_idx" ON "Variant"("orgId");

-- CreateIndex
CREATE INDEX "Variant_orgId_sku_idx" ON "Variant"("orgId", "sku");

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_orgId_phone_key" ON "Customer"("orgId", "phone");

-- CreateIndex
CREATE INDEX "Order_orgId_status_createdAt_idx" ON "Order"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_orgId_confirmedById_idx" ON "Order"("orgId", "confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orgId_code_key" ON "Order"("orgId", "code");

-- CreateIndex
CREATE INDEX "OrderItem_orgId_idx" ON "OrderItem"("orgId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_orderId_key" ON "Parcel"("orderId");

-- CreateIndex
CREATE INDEX "Parcel_orgId_status_idx" ON "Parcel"("orgId", "status");

-- CreateIndex
CREATE INDEX "DeliveryNote_orgId_idx" ON "DeliveryNote"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_orgId_ref_key" ON "DeliveryNote"("orgId", "ref");

-- CreateIndex
CREATE INDEX "DeliveryNoteParcel_orgId_idx" ON "DeliveryNoteParcel"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNoteParcel_deliveryNoteId_parcelId_key" ON "DeliveryNoteParcel"("deliveryNoteId", "parcelId");

-- CreateIndex
CREATE INDEX "CityAlias_orgId_idx" ON "CityAlias"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CityAlias_orgId_rawName_key" ON "CityAlias"("orgId", "rawName");

-- CreateIndex
CREATE INDEX "NeighAlias_orgId_idx" ON "NeighAlias"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "NeighAlias_orgId_token_key" ON "NeighAlias"("orgId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSettings_orgId_key" ON "FinanceSettings"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteParcel" ADD CONSTRAINT "DeliveryNoteParcel_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteParcel" ADD CONSTRAINT "DeliveryNoteParcel_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteParcel" ADD CONSTRAINT "DeliveryNoteParcel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityAlias" ADD CONSTRAINT "CityAlias_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeighAlias" ADD CONSTRAINT "NeighAlias_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSettings" ADD CONSTRAINT "FinanceSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Row-Level Security (Chunk 0.3) — second isolation net.
-- For every TENANT table: enable + FORCE RLS (so even the table owner / Neon
-- role is subject to it), with an org-isolation policy keyed on the
-- `app.current_org_id` GUC. current_setting(..., true) returns NULL when unset
-- → comparison is false → ZERO rows (safe default).
-- Excluded (global / identity): Organization, User, CityCatalog.
-- ============================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Membership','Integration','Product','Variant','Customer','Order',
    'OrderItem','Parcel','DeliveryNote','DeliveryNoteParcel','CityAlias',
    'NeighAlias','FinanceSettings','AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY org_isolation ON %I
        USING ("orgId" = current_setting('app.current_org_id', true))
        WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
    $f$, t);
  END LOOP;
END $$;
