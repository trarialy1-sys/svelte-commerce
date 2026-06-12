-- Phase 4 — stock control on hero products
ALTER TABLE "Variant" ADD COLUMN     "isHero" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Variant" ADD COLUMN     "manualOOS" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Variant" ADD COLUMN     "reorderThreshold" INTEGER;
ALTER TABLE "Variant" ADD COLUMN     "leadTimeDays" INTEGER;

CREATE INDEX "Variant_orgId_isHero_idx" ON "Variant"("orgId", "isHero");
