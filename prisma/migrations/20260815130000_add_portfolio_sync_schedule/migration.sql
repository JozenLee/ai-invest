CREATE TABLE "PortfolioSyncSchedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "syncTimes" TEXT NOT NULL DEFAULT '["00:00","12:00"]',
  "lastRunAt" DATETIME,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PortfolioSyncSchedule_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PortfolioSyncSchedule_portfolioId_key" ON "PortfolioSyncSchedule"("portfolioId");

INSERT INTO "PortfolioSyncSchedule" ("id", "portfolioId", "enabled", "timezone", "syncTimes", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "id", true, 'Asia/Shanghai', '["00:00","12:00"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Portfolio";
