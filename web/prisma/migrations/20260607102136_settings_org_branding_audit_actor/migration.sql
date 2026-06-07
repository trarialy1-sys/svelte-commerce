-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca';

-- Null out any audit rows whose actor no longer exists, so the FK applies
-- cleanly to existing data (actorUserId is nullable; SET NULL is the delete rule).
UPDATE "AuditLog" a
SET "actorUserId" = NULL
WHERE a."actorUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a."actorUserId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
