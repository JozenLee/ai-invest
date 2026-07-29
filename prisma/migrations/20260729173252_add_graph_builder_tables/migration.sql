-- CreateTable
CREATE TABLE "XiaohongshuPostExtra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "collects" INTEGER NOT NULL DEFAULT 0,
    "hasGoodsLink" BOOLEAN NOT NULL DEFAULT false,
    "topicIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XiaohongshuPostExtra_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InfluencerPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZhihuPostExtra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "questionId" TEXT,
    "questionTitle" TEXT,
    "voteupCount" INTEGER NOT NULL DEFAULT 0,
    "votedownCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZhihuPostExtra_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InfluencerPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DouyinPostExtra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "videoDuration" INTEGER NOT NULL,
    "musicId" TEXT,
    "musicTitle" TEXT,
    "musicAuthor" TEXT,
    "challengeTags" TEXT,
    "isAd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DouyinPostExtra_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InfluencerPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlipayPostExtra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "articleType" TEXT NOT NULL,
    "category" TEXT,
    "serviceId" TEXT,
    "hasService" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlipayPostExtra_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InfluencerPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "configData" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "data" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphExtractionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "sourceText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extractedData" TEXT,
    "suggestionsCreated" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "XiaohongshuPostExtra_postId_key" ON "XiaohongshuPostExtra"("postId");

-- CreateIndex
CREATE INDEX "XiaohongshuPostExtra_postId_idx" ON "XiaohongshuPostExtra"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ZhihuPostExtra_postId_key" ON "ZhihuPostExtra"("postId");

-- CreateIndex
CREATE INDEX "ZhihuPostExtra_postId_idx" ON "ZhihuPostExtra"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "DouyinPostExtra_postId_key" ON "DouyinPostExtra"("postId");

-- CreateIndex
CREATE INDEX "DouyinPostExtra_postId_idx" ON "DouyinPostExtra"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "AlipayPostExtra_postId_key" ON "AlipayPostExtra"("postId");

-- CreateIndex
CREATE INDEX "AlipayPostExtra_postId_idx" ON "AlipayPostExtra"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_platform_key" ON "PlatformConfig"("platform");

-- CreateIndex
CREATE INDEX "PlatformConfig_platform_idx" ON "PlatformConfig"("platform");

-- CreateIndex
CREATE INDEX "PlatformConfig_isActive_idx" ON "PlatformConfig"("isActive");

-- CreateIndex
CREATE INDEX "GraphSuggestion_status_createdAt_idx" ON "GraphSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GraphSuggestion_source_status_idx" ON "GraphSuggestion"("source", "status");

-- CreateIndex
CREATE INDEX "GraphSuggestion_type_idx" ON "GraphSuggestion"("type");

-- CreateIndex
CREATE INDEX "GraphExtractionJob_status_createdAt_idx" ON "GraphExtractionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GraphExtractionJob_sourceType_sourceId_idx" ON "GraphExtractionJob"("sourceType", "sourceId");
