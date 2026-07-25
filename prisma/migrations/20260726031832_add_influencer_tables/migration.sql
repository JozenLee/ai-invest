-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "showEstimatedData" BOOLEAN NOT NULL DEFAULT true,
    "showDataQualityBadge" BOOLEAN NOT NULL DEFAULT true,
    "autoRefreshInterval" INTEGER NOT NULL DEFAULT 300000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InfluencerFetchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "influencerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "postsFetched" INTEGER NOT NULL DEFAULT 0,
    "postsNew" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InfluencerAnalysisLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Influencer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "fetchInterval" INTEGER NOT NULL DEFAULT 60,
    "driverType" TEXT NOT NULL DEFAULT 'api',
    "providerConfig" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchAt" DATETIME,
    "lastFetchStatus" TEXT,
    "lastFetchError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Influencer" ("accountId", "avatarUrl", "category", "createdAt", "id", "isActive", "name", "platform", "profileUrl", "tags") SELECT "accountId", "avatarUrl", "category", "createdAt", "id", "isActive", "name", "platform", "profileUrl", "tags" FROM "Influencer";
DROP TABLE "Influencer";
ALTER TABLE "new_Influencer" RENAME TO "Influencer";
CREATE INDEX "Influencer_priority_isActive_idx" ON "Influencer"("priority", "isActive");
CREATE INDEX "Influencer_lastFetchAt_idx" ON "Influencer"("lastFetchAt");
CREATE UNIQUE INDEX "Influencer_platform_accountId_key" ON "Influencer"("platform", "accountId");
CREATE TABLE "new_InfluencerPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "influencerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalUrl" TEXT,
    "publishTime" DATETIME NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrls" TEXT,
    "engagement" TEXT,
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessedAt" DATETIME,
    "aiError" TEXT,
    "opinionSummary" TEXT,
    "opinionStance" TEXT,
    "opinionConfidence" REAL DEFAULT 0,
    "mainPoints" TEXT,
    "arguments" TEXT,
    "credibilityScore" REAL DEFAULT 0,
    "primaryDomain" TEXT,
    "secondaryDomains" TEXT,
    "domainScores" TEXT,
    "sentiment" REAL,
    "sentimentAspects" TEXT,
    "risks" TEXT,
    "investmentImplications" TEXT,
    "consistencyChecked" BOOLEAN NOT NULL DEFAULT false,
    "consistencyData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InfluencerPost_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InfluencerPost" ("content", "createdAt", "id", "influencerId", "originalUrl", "publishTime", "sentiment") SELECT "content", "createdAt", "id", "influencerId", "originalUrl", "publishTime", "sentiment" FROM "InfluencerPost";
DROP TABLE "InfluencerPost";
ALTER TABLE "new_InfluencerPost" RENAME TO "InfluencerPost";
CREATE INDEX "InfluencerPost_influencerId_publishTime_idx" ON "InfluencerPost"("influencerId", "publishTime");
CREATE INDEX "InfluencerPost_aiProcessed_idx" ON "InfluencerPost"("aiProcessed");
CREATE INDEX "InfluencerPost_primaryDomain_publishTime_idx" ON "InfluencerPost"("primaryDomain", "publishTime");
CREATE INDEX "InfluencerPost_opinionStance_idx" ON "InfluencerPost"("opinionStance");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "InfluencerFetchLog_influencerId_idx" ON "InfluencerFetchLog"("influencerId");

-- CreateIndex
CREATE INDEX "InfluencerFetchLog_createdAt_idx" ON "InfluencerFetchLog"("createdAt");

-- CreateIndex
CREATE INDEX "InfluencerFetchLog_status_idx" ON "InfluencerFetchLog"("status");

-- CreateIndex
CREATE INDEX "InfluencerAnalysisLog_postId_idx" ON "InfluencerAnalysisLog"("postId");

-- CreateIndex
CREATE INDEX "InfluencerAnalysisLog_createdAt_idx" ON "InfluencerAnalysisLog"("createdAt");
