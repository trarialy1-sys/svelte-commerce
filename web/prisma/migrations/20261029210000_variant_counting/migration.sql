-- Variant option label (e.g. "Noir / XL") + physical count fields (Comptage).
-- Additive only.
ALTER TABLE "Variant" ADD COLUMN "optionLabel" TEXT;
ALTER TABLE "Variant" ADD COLUMN "lastCountedAt" TIMESTAMP(3);
ALTER TABLE "Variant" ADD COLUMN "lastCountedBy" TEXT;
ALTER TABLE "Variant" ADD COLUMN "countNote" TEXT;
