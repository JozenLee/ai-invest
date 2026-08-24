PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Holding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "avgCost" REAL NOT NULL,
  "currentPrice" REAL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Holding" ("id", "portfolioId", "ticker", "market", "name", "quantity", "avgCost", "currentPrice", "updatedAt")
SELECT "id", "portfolioId", "ticker", "market", "name", "quantity", "avgCost", "currentPrice", "updatedAt" FROM "Holding";

DROP TABLE "Holding";
ALTER TABLE "new_Holding" RENAME TO "Holding";
CREATE UNIQUE INDEX "Holding_portfolioId_ticker_key" ON "Holding"("portfolioId", "ticker");

PRAGMA foreign_keys=ON;
