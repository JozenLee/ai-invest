-- CreateTable
CREATE TABLE "SchedulerJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL,
    "scheduleConfig" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchedulerJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilterRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StorageConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "maxArticles" INTEGER NOT NULL DEFAULT 10000,
    "archiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "archiveAfterDays" INTEGER NOT NULL DEFAULT 30,
    "cleanupSchedule" TEXT NOT NULL DEFAULT '0 2 * * *',
    "lastCleanupAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "driverType" TEXT NOT NULL DEFAULT 'api',
    "provider" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "configSchema" TEXT,
    "updateFrequency" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchAt" DATETIME,
    "lastFetchStatus" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DataSource" ("config", "createdAt", "id", "isActive", "lastFetchAt", "name", "provider", "type", "updateFrequency") SELECT "config", "createdAt", "id", "isActive", "lastFetchAt", "name", "provider", "type", "updateFrequency" FROM "DataSource";
DROP TABLE "DataSource";
ALTER TABLE "new_DataSource" RENAME TO "DataSource";
CREATE TABLE "new_DataSourceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "errorDetail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataSourceLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DataSourceLog" ("createdAt", "duration", "fetchedCount", "id", "message", "sourceId", "status") SELECT "createdAt", "duration", "fetchedCount", "id", "message", "sourceId", "status" FROM "DataSourceLog";
DROP TABLE "DataSourceLog";
ALTER TABLE "new_DataSourceLog" RENAME TO "DataSourceLog";
CREATE INDEX "DataSourceLog_sourceId_idx" ON "DataSourceLog"("sourceId");
CREATE INDEX "DataSourceLog_createdAt_idx" ON "DataSourceLog"("createdAt");
CREATE INDEX "DataSourceLog_status_idx" ON "DataSourceLog"("status");
CREATE TABLE "new_NewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishTime" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryConfidence" REAL DEFAULT 0,
    "domainId" TEXT,
    "domainIds" TEXT,
    "sourceId" TEXT,
    "sentiment" REAL,
    "sentimentLabel" TEXT,
    "sentimentConfidence" REAL DEFAULT 0,
    "impact" INTEGER,
    "entities" TEXT,
    "keywords" TEXT,
    "sectors" TEXT,
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessedAt" DATETIME,
    "aiError" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NewsCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsArticle_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsArticle" ("category", "categoryId", "content", "createdAt", "domainId", "entities", "id", "impact", "publishTime", "sectors", "sentiment", "source", "sourceId", "summary", "title", "url") SELECT "category", "categoryId", "content", "createdAt", "domainId", "entities", "id", "impact", "publishTime", "sectors", "sentiment", "source", "sourceId", "summary", "title", "url" FROM "NewsArticle";
DROP TABLE "NewsArticle";
ALTER TABLE "new_NewsArticle" RENAME TO "NewsArticle";
CREATE UNIQUE INDEX "NewsArticle_url_key" ON "NewsArticle"("url");
CREATE INDEX "NewsArticle_publishTime_idx" ON "NewsArticle"("publishTime");
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");
CREATE INDEX "NewsArticle_categoryId_idx" ON "NewsArticle"("categoryId");
CREATE INDEX "NewsArticle_domainId_idx" ON "NewsArticle"("domainId");
CREATE INDEX "NewsArticle_sourceId_idx" ON "NewsArticle"("sourceId");
CREATE INDEX "NewsArticle_aiProcessed_idx" ON "NewsArticle"("aiProcessed");
CREATE INDEX "NewsArticle_expiresAt_idx" ON "NewsArticle"("expiresAt");
CREATE INDEX "NewsArticle_sentimentLabel_idx" ON "NewsArticle"("sentimentLabel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SchedulerJob_sourceId_idx" ON "SchedulerJob"("sourceId");

-- CreateIndex
CREATE INDEX "SchedulerJob_isEnabled_nextRunAt_idx" ON "SchedulerJob"("isEnabled", "nextRunAt");
