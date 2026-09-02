-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "market" TEXT NOT NULL DEFAULT 'CN',
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "data_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "profile" TEXT NOT NULL DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "data_subscriptions_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subscription_datasets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tradingIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "closedIntervalSeconds" INTEGER NOT NULL DEFAULT 3600,
    "cronExpression" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "lastStartedAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "nextRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "subscription_datasets_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "data_subscriptions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "data_fetch_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "storedCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "qualityStatus" TEXT,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "data_fetch_runs_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "subscription_datasets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "instruments_type_status_idx" ON "instruments"("type", "status");
CREATE UNIQUE INDEX "instruments_type_code_key" ON "instruments"("type", "code");
CREATE UNIQUE INDEX "data_subscriptions_instrumentId_key" ON "data_subscriptions"("instrumentId");
CREATE INDEX "data_subscriptions_enabled_updatedAt_idx" ON "data_subscriptions"("enabled", "updatedAt");
CREATE INDEX "subscription_datasets_enabled_nextRunAt_idx" ON "subscription_datasets"("enabled", "nextRunAt");
CREATE INDEX "subscription_datasets_datasetKey_status_idx" ON "subscription_datasets"("datasetKey", "status");
CREATE UNIQUE INDEX "subscription_datasets_subscriptionId_datasetKey_key" ON "subscription_datasets"("subscriptionId", "datasetKey");
CREATE INDEX "data_fetch_runs_datasetId_startedAt_idx" ON "data_fetch_runs"("datasetId", "startedAt");
CREATE INDEX "data_fetch_runs_targetCode_status_idx" ON "data_fetch_runs"("targetCode", "status");

CREATE TABLE "stock_financial_reports" (
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
CREATE TABLE "stock_announcements" (
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
CREATE TABLE "raw_payloads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetKey" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "provider" TEXT,
    "payload" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "stock_financial_reports_stockCode_reportType_reportPeriod_key" ON "stock_financial_reports"("stockCode", "reportType", "reportPeriod");
CREATE INDEX "stock_financial_reports_stockCode_publishDate_idx" ON "stock_financial_reports"("stockCode", "publishDate");
CREATE UNIQUE INDEX "stock_announcements_stockCode_announcementId_key" ON "stock_announcements"("stockCode", "announcementId");
CREATE INDEX "stock_announcements_stockCode_publishDate_idx" ON "stock_announcements"("stockCode", "publishDate");
CREATE INDEX "raw_payloads_datasetKey_targetCode_fetchedAt_idx" ON "raw_payloads"("datasetKey", "targetCode", "fetchedAt");
