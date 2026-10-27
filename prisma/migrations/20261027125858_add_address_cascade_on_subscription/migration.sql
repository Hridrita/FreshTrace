-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextDeliveryAt" DATETIME NOT NULL,
    "pauseUntil" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("addressId", "createdAt", "customerId", "dayOfWeek", "endedAt", "id", "nextDeliveryAt", "pauseUntil", "planId", "startedAt", "status", "updatedAt") SELECT "addressId", "createdAt", "customerId", "dayOfWeek", "endedAt", "id", "nextDeliveryAt", "pauseUntil", "planId", "startedAt", "status", "updatedAt" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_customerId_status_idx" ON "Subscription"("customerId", "status");
CREATE INDEX "Subscription_status_nextDeliveryAt_idx" ON "Subscription"("status", "nextDeliveryAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
