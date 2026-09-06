CREATE TABLE "subscription_configuration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "payload" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "market_quotes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instrumentType" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "market" TEXT NOT NULL DEFAULT 'CN',
  "currency" TEXT,
  "price" REAL NOT NULL,
  "previousClose" REAL,
  "open" REAL,
  "high" REAL,
  "low" REAL,
  "volume" REAL,
  "amount" REAL,
  "changePct" REAL,
  "tradeDate" TEXT NOT NULL,
  "source" TEXT,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "market_quotes_instrumentType_code_key" ON "market_quotes"("instrumentType", "code");
