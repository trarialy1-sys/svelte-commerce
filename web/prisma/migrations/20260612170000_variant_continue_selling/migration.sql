-- Shopify inventoryPolicy CONTINUE → variant sells when out of stock
ALTER TABLE "Variant" ADD COLUMN     "continueSelling" BOOLEAN NOT NULL DEFAULT false;
