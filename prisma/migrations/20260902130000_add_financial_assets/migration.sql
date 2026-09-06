CREATE TABLE IF NOT EXISTS "stock_financial_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCode" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportPeriod" TEXT NOT NULL,
    "publishDate" DATETIME,
    "metricsJson" TEXT NOT NULL,
    "source" TEXT,
    "sourceUpdatedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "stock_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCode" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT,
    "publishDate" DATETIME,
    "url" TEXT,
    "content" TEXT,
    "source" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "raw_payloads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetKey" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "provider" TEXT,
    "payload" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "stock_financial_reports_stockCode_reportType_reportPeriod_key" ON "stock_financial_reports"("stockCode", "reportType", "reportPeriod");
CREATE INDEX IF NOT EXISTS "stock_financial_reports_stockCode_publishDate_idx" ON "stock_financial_reports"("stockCode", "publishDate");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_announcements_stockCode_announcementId_key" ON "stock_announcements"("stockCode", "announcementId");
CREATE INDEX IF NOT EXISTS "stock_announcements_stockCode_publishDate_idx" ON "stock_announcements"("stockCode", "publishDate");
CREATE INDEX IF NOT EXISTS "raw_payloads_datasetKey_targetCode_fetchedAt_idx" ON "raw_payloads"("datasetKey", "targetCode", "fetchedAt");
