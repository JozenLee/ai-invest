-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "riskProfile" TEXT NOT NULL DEFAULT 'moderate',
    "investHorizon" TEXT NOT NULL DEFAULT 'medium',
    "totalAssets" REAL NOT NULL DEFAULT 0,
    "cashRatio" REAL NOT NULL DEFAULT 0.2,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgCost" REAL NOT NULL,
    "currentPrice" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" BIGINT NOT NULL,
    "amount" REAL
);

-- CreateTable
CREATE TABLE "IndexDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" BIGINT NOT NULL,
    "changePct" REAL
);

-- CreateTable
CREATE TABLE "ETFDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" BIGINT NOT NULL,
    "amount" REAL,
    "nav" REAL,
    "shares" BIGINT,
    "premium" REAL
);

-- CreateTable
CREATE TABLE "SectorCapitalFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "sector" TEXT NOT NULL,
    "sectorLevel" TEXT NOT NULL,
    "mainForceNet" REAL NOT NULL,
    "retailNet" REAL NOT NULL,
    "totalVolume" REAL NOT NULL,
    "changePct" REAL,
    "consecutiveDays" INTEGER
);

-- CreateTable
CREATE TABLE "MarketCapitalFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "totalMainNet" REAL NOT NULL,
    "retailNet" REAL NOT NULL,
    "sentiment" REAL NOT NULL,
    "turnoverRate" REAL,
    "northboundNet" REAL NOT NULL,
    "marginBalance" REAL NOT NULL,
    "marginChange" REAL NOT NULL,
    "blockTradeCount" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishTime" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "sentiment" REAL,
    "impact" INTEGER,
    "entities" TEXT,
    "sectors" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "cyclePos" TEXT,
    "momentum" REAL,
    "metadata" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "lag" TEXT,
    "confidence" REAL NOT NULL,
    "evidence" TEXT,
    "description" TEXT,
    CONSTRAINT "GraphEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GraphEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relevance" REAL NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "GraphStock_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT,
    "edgeId" TEXT,
    "action" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphChangeLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "input" TEXT,
    "result" TEXT NOT NULL,
    "score" REAL,
    "rating" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");

-- CreateIndex
CREATE INDEX "StockDaily_ticker_date_idx" ON "StockDaily"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockDaily_ticker_date_key" ON "StockDaily"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "IndexDaily_code_date_key" ON "IndexDaily"("code", "date");

-- CreateIndex
CREATE INDEX "ETFDaily_ticker_date_idx" ON "ETFDaily"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ETFDaily_ticker_date_key" ON "ETFDaily"("ticker", "date");

-- CreateIndex
CREATE INDEX "SectorCapitalFlow_date_idx" ON "SectorCapitalFlow"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SectorCapitalFlow_date_sector_key" ON "SectorCapitalFlow"("date", "sector");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCapitalFlow_date_key" ON "MarketCapitalFlow"("date");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_url_key" ON "NewsArticle"("url");

-- CreateIndex
CREATE INDEX "NewsArticle_publishTime_idx" ON "NewsArticle"("publishTime");

-- CreateIndex
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");

-- CreateIndex
CREATE INDEX "GraphNode_type_idx" ON "GraphNode"("type");

-- CreateIndex
CREATE INDEX "GraphNode_parentId_idx" ON "GraphNode"("parentId");

-- CreateIndex
CREATE INDEX "GraphNode_level_idx" ON "GraphNode"("level");

-- CreateIndex
CREATE INDEX "GraphEdge_sourceId_idx" ON "GraphEdge"("sourceId");

-- CreateIndex
CREATE INDEX "GraphEdge_targetId_idx" ON "GraphEdge"("targetId");

-- CreateIndex
CREATE INDEX "GraphStock_ticker_idx" ON "GraphStock"("ticker");

-- CreateIndex
CREATE INDEX "GraphChangeLog_nodeId_idx" ON "GraphChangeLog"("nodeId");

-- CreateIndex
CREATE INDEX "GraphChangeLog_createdAt_idx" ON "GraphChangeLog"("createdAt");

-- CreateIndex
CREATE INDEX "Analysis_userId_type_idx" ON "Analysis"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_ticker_key" ON "Watchlist"("userId", "ticker");
