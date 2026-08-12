-- CreateTable
CREATE TABLE "news_impact_factors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsId" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "segmentCode" TEXT NOT NULL,
    "impactFactor" REAL NOT NULL,
    "impactType" TEXT NOT NULL,
    "distance" INTEGER NOT NULL DEFAULT 0,
    "calculation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "news_impact_factors_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "NewsArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "news_impact_factors_newsId_idx" ON "news_impact_factors"("newsId");

-- CreateIndex
CREATE INDEX "news_impact_factors_industryCode_segmentCode_idx" ON "news_impact_factors"("industryCode", "segmentCode");

-- CreateIndex
CREATE INDEX "news_impact_factors_impactFactor_idx" ON "news_impact_factors"("impactFactor");

-- CreateIndex
CREATE UNIQUE INDEX "news_impact_factors_newsId_industryCode_segmentCode_key" ON "news_impact_factors"("newsId", "industryCode", "segmentCode");
