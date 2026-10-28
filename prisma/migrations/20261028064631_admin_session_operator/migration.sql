/*
  Warnings:

  - Added the required column `operatorId` to the `AdminSession` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdminSession" ("createdAt", "expiresAt", "id", "ipAddress", "lastUsedAt", "tokenHash", "userAgent") SELECT "createdAt", "expiresAt", "id", "ipAddress", "lastUsedAt", "tokenHash", "userAgent" FROM "AdminSession";
DROP TABLE "AdminSession";
ALTER TABLE "new_AdminSession" RENAME TO "AdminSession";
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_operatorId_idx" ON "AdminSession"("operatorId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
