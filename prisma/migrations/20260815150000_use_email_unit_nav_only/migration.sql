-- Keep only the email-provided unit NAV as the canonical holding price.
CREATE TABLE "new_Holding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unitNav" REAL NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "new_Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

INSERT INTO "new_Holding" ("id", "portfolioId", "ticker", "market", "name", "quantity", "unitNav", "updatedAt")
SELECT "id", "portfolioId", "ticker", "market", "name", "quantity", COALESCE("unitNav", "avgCost"), "updatedAt"
FROM "Holding";

DROP TABLE "Holding";
ALTER TABLE "new_Holding" RENAME TO "Holding";

CREATE UNIQUE INDEX "Holding_portfolioId_ticker_key" ON "Holding"("portfolioId", "ticker");
