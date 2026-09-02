CREATE TABLE "data_subscription_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tradingIntervalSeconds" INTEGER NOT NULL,
    "closedIntervalSeconds" INTEGER NOT NULL,
    "lastRunAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "data_subscription_schedules_scope_key" ON "data_subscription_schedules"("scope");

INSERT INTO "data_subscription_schedules" ("id", "scope", "enabled", "tradingIntervalSeconds", "closedIntervalSeconds", "updatedAt") VALUES
    ('data-schedule-market-index', 'market_index', true, 30, 120, CURRENT_TIMESTAMP),
    ('data-schedule-etf-index', 'etf_index', true, 180, 3600, CURRENT_TIMESTAMP),
    ('data-schedule-company-quote', 'company_quote', true, 1800, 86400, CURRENT_TIMESTAMP);
