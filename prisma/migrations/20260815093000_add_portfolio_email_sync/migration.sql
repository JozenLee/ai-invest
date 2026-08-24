-- Persist the cash portion and the source of the latest portfolio snapshot.
ALTER TABLE "Portfolio" ADD COLUMN "cashBalance" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Portfolio" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "Portfolio" ADD COLUMN "lastSyncEmail" TEXT;

-- A portfolio cannot contain the same fund twice; email sync relies on this key
-- to atomically upsert the latest statement row.
-- Keep the oldest row when upgrading databases created by the historical seed,
-- which could insert the same demo holdings more than once.
DELETE FROM "Holding"
WHERE "id" NOT IN (
  SELECT MIN("id") FROM "Holding" GROUP BY "portfolioId", "ticker"
);
CREATE UNIQUE INDEX "Holding_portfolioId_ticker_key" ON "Holding"("portfolioId", "ticker");
