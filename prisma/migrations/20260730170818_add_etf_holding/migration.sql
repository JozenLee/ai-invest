-- CreateTable
CREATE TABLE "ETFHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "etfCode" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "shares" BIGINT,
    "marketValue" REAL,
    "updateDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ETFHolding_etfCode_idx" ON "ETFHolding"("etfCode");

-- CreateIndex
CREATE UNIQUE INDEX "ETFHolding_etfCode_stockCode_key" ON "ETFHolding"("etfCode", "stockCode");
