-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Influencer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "fetchInterval" INTEGER NOT NULL DEFAULT 60,
    "driverType" TEXT NOT NULL DEFAULT 'api',
    "providerConfig" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchAt" DATETIME,
    "lastFetchStatus" TEXT,
    "lastFetchError" TEXT,
    "scheduleType" TEXT NOT NULL DEFAULT 'polling',
    "dailyFetchTimes" TEXT,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Influencer" ("accountId", "avatarUrl", "category", "createdAt", "driverType", "fetchInterval", "id", "isActive", "lastFetchAt", "lastFetchError", "lastFetchStatus", "name", "platform", "priority", "profileUrl", "providerConfig", "tags", "updatedAt") SELECT "accountId", "avatarUrl", "category", "createdAt", "driverType", "fetchInterval", "id", "isActive", "lastFetchAt", "lastFetchError", "lastFetchStatus", "name", "platform", "priority", "profileUrl", "providerConfig", "tags", "updatedAt" FROM "Influencer";
DROP TABLE "Influencer";
ALTER TABLE "new_Influencer" RENAME TO "Influencer";
CREATE INDEX "Influencer_priority_isActive_idx" ON "Influencer"("priority", "isActive");
CREATE INDEX "Influencer_lastFetchAt_idx" ON "Influencer"("lastFetchAt");
CREATE UNIQUE INDEX "Influencer_platform_accountId_key" ON "Influencer"("platform", "accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
