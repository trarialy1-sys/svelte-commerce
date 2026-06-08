-- Reporting (3.2): btree indexes for date-ranged aggregate reports.

-- CreateIndex
CREATE INDEX "Order_orgId_createdAt_idx" ON "Order"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_orgId_cityId_idx" ON "Order"("orgId", "cityId");

-- CreateIndex
CREATE INDEX "OrderItem_orgId_sku_idx" ON "OrderItem"("orgId", "sku");

-- CreateIndex
CREATE INDEX "Parcel_orgId_status_updatedAt_idx" ON "Parcel"("orgId", "status", "updatedAt");
