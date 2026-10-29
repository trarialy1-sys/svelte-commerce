-- Ozon raw tracking + returns workflow (auto restock + warehouse check).
-- Additive only: new nullable columns / defaulted column + one index.
ALTER TABLE "Parcel" ADD COLUMN "ozonStatus" TEXT;
ALTER TABLE "Parcel" ADD COLUMN "ozonComment" TEXT;
ALTER TABLE "Parcel" ADD COLUMN "ozonEventAt" TEXT;
ALTER TABLE "Parcel" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'APP';
ALTER TABLE "Parcel" ADD COLUMN "returnReceivedAt" TIMESTAMP(3);
ALTER TABLE "Parcel" ADD COLUMN "restockedAt" TIMESTAMP(3);
ALTER TABLE "Parcel" ADD COLUMN "returnCheck" TEXT;
ALTER TABLE "Parcel" ADD COLUMN "returnCheckAt" TIMESTAMP(3);
ALTER TABLE "Parcel" ADD COLUMN "returnCheckBy" TEXT;
ALTER TABLE "Parcel" ADD COLUMN "returnCheckNote" TEXT;

CREATE INDEX "Parcel_orgId_returnCheck_idx" ON "Parcel"("orgId", "returnCheck");
