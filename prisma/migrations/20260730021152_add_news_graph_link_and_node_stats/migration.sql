-- CreateTable
CREATE TABLE "NewsGraphLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "relevance" REAL NOT NULL,
    "sentiment" TEXT NOT NULL,
    "impactType" TEXT NOT NULL,
    "keyMentions" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsGraphLink_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "NewsArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsGraphLink_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "cyclePos" TEXT,
    "momentum" REAL,
    "metadata" TEXT,
    "newsCount7d" INTEGER NOT NULL DEFAULT 0,
    "newsCount30d" INTEGER NOT NULL DEFAULT 0,
    "sentimentScore" REAL,
    "lastNewsAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GraphNode" ("createdAt", "cyclePos", "description", "id", "level", "metadata", "momentum", "name", "parentId", "type", "updatedAt") SELECT "createdAt", "cyclePos", "description", "id", "level", "metadata", "momentum", "name", "parentId", "type", "updatedAt" FROM "GraphNode";
DROP TABLE "GraphNode";
ALTER TABLE "new_GraphNode" RENAME TO "GraphNode";
CREATE INDEX "GraphNode_type_idx" ON "GraphNode"("type");
CREATE INDEX "GraphNode_parentId_idx" ON "GraphNode"("parentId");
CREATE INDEX "GraphNode_level_idx" ON "GraphNode"("level");
CREATE INDEX "GraphNode_lastNewsAt_idx" ON "GraphNode"("lastNewsAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NewsGraphLink_nodeId_createdAt_idx" ON "NewsGraphLink"("nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsGraphLink_newsId_idx" ON "NewsGraphLink"("newsId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsGraphLink_newsId_nodeId_key" ON "NewsGraphLink"("newsId", "nodeId");
