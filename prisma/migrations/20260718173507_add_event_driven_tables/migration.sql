-- CreateTable
CREATE TABLE "NewsCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NewsCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT,
    "graphNodes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "updateFrequency" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataSourceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataSourceLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InfluencerPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "influencerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalUrl" TEXT,
    "publishTime" DATETIME NOT NULL,
    "sentiment" REAL,
    "extractedTopics" TEXT,
    "relatedDomains" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InfluencerPost_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainInfluencer" (
    "domainId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "relevance" REAL NOT NULL DEFAULT 1.0,

    PRIMARY KEY ("domainId", "influencerId"),
    CONSTRAINT "DomainInfluencer_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DomainInfluencer_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishTime" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "domainId" TEXT,
    "sourceId" TEXT,
    "sentiment" REAL,
    "impact" INTEGER,
    "entities" TEXT,
    "sectors" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NewsCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsArticle_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsArticle" ("category", "content", "createdAt", "entities", "id", "impact", "publishTime", "sectors", "sentiment", "source", "summary", "title", "url") SELECT "category", "content", "createdAt", "entities", "id", "impact", "publishTime", "sectors", "sentiment", "source", "summary", "title", "url" FROM "NewsArticle";
DROP TABLE "NewsArticle";
ALTER TABLE "new_NewsArticle" RENAME TO "NewsArticle";
CREATE UNIQUE INDEX "NewsArticle_url_key" ON "NewsArticle"("url");
CREATE INDEX "NewsArticle_publishTime_idx" ON "NewsArticle"("publishTime");
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");
CREATE INDEX "NewsArticle_categoryId_idx" ON "NewsArticle"("categoryId");
CREATE INDEX "NewsArticle_domainId_idx" ON "NewsArticle"("domainId");
CREATE INDEX "NewsArticle_sourceId_idx" ON "NewsArticle"("sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NewsCategory_code_key" ON "NewsCategory"("code");

-- CreateIndex
CREATE INDEX "NewsCategory_parentId_idx" ON "NewsCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_code_key" ON "Domain"("code");

-- CreateIndex
CREATE INDEX "DataSourceLog_sourceId_idx" ON "DataSourceLog"("sourceId");

-- CreateIndex
CREATE INDEX "DataSourceLog_createdAt_idx" ON "DataSourceLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_platform_accountId_key" ON "Influencer"("platform", "accountId");

-- CreateIndex
CREATE INDEX "InfluencerPost_influencerId_idx" ON "InfluencerPost"("influencerId");

-- CreateIndex
CREATE INDEX "InfluencerPost_publishTime_idx" ON "InfluencerPost"("publishTime");
