-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "keywords" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "NewsArticleTag" (
    "newsId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("newsId", "tagId"),
    CONSTRAINT "NewsArticleTag_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "NewsArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphNodeTag" (
    "nodeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "relevance" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("nodeId", "tagId"),
    CONSTRAINT "GraphNodeTag_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GraphNodeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainTag" (
    "domainId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("domainId", "tagId"),
    CONSTRAINT "DomainTag_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DomainTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphNodeETF" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "etfCode" TEXT NOT NULL,
    "etfName" TEXT NOT NULL,
    "bindType" TEXT NOT NULL DEFAULT 'tracking',
    "weight" REAL NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GraphNodeETF_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_code_key" ON "Tag"("code");

-- CreateIndex
CREATE INDEX "Tag_parentId_idx" ON "Tag"("parentId");

-- CreateIndex
CREATE INDEX "Tag_type_level_idx" ON "Tag"("type", "level");

-- CreateIndex
CREATE INDEX "Tag_isActive_sortOrder_idx" ON "Tag"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "NewsArticleTag_tagId_createdAt_idx" ON "NewsArticleTag"("tagId", "createdAt");

-- CreateIndex
CREATE INDEX "GraphNodeTag_tagId_idx" ON "GraphNodeTag"("tagId");

-- CreateIndex
CREATE INDEX "GraphNodeETF_etfCode_idx" ON "GraphNodeETF"("etfCode");

-- CreateIndex
CREATE INDEX "GraphNodeETF_nodeId_idx" ON "GraphNodeETF"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNodeETF_nodeId_etfCode_key" ON "GraphNodeETF"("nodeId", "etfCode");
