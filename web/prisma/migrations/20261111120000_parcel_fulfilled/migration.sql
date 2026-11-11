-- Shopify fulfilment of shipped parcels (never twice). Additive only.
ALTER TABLE "Parcel" ADD COLUMN "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "Parcel" ADD COLUMN "fulfilNote" TEXT;
