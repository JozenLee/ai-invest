-- CreateTable
CREATE TABLE "SubGraph" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "avgScore" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NodeScoreHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalScore" REAL NOT NULL,
    "components" TEXT NOT NULL,
    CONSTRAINT "NodeScoreHistory_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "subGraphId" TEXT NOT NULL,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentScore" REAL NOT NULL,
    "scoreChange" REAL NOT NULL,
    "previousScore" REAL,
    "suggestedAction" TEXT NOT NULL,
    "relatedETFs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "userNote" TEXT,
    "dismissedAt" DATETIME,
    CONSTRAINT "InvestmentSignal_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GraphEdge" (
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
    "isCrossGraph" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "GraphEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GraphEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GraphEdge" ("confidence", "description", "direction", "evidence", "id", "lag", "relation", "sourceId", "targetId", "weight") SELECT "confidence", "description", "direction", "evidence", "id", "lag", "relation", "sourceId", "targetId", "weight" FROM "GraphEdge";
DROP TABLE "GraphEdge";
ALTER TABLE "new_GraphEdge" RENAME TO "GraphEdge";
CREATE INDEX "GraphEdge_sourceId_idx" ON "GraphEdge"("sourceId");
CREATE INDEX "GraphEdge_targetId_idx" ON "GraphEdge"("targetId");
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
    "subGraphId" TEXT,
    "scoreComponents" TEXT,
    "totalScore" REAL NOT NULL DEFAULT 0,
    "scoreUpdatedAt" DATETIME,
    "trendIndicator" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GraphNode" ("createdAt", "cyclePos", "description", "id", "lastNewsAt", "level", "metadata", "momentum", "name", "newsCount30d", "newsCount7d", "parentId", "sentimentScore", "type", "updatedAt") SELECT "createdAt", "cyclePos", "description", "id", "lastNewsAt", "level", "metadata", "momentum", "name", "newsCount30d", "newsCount7d", "parentId", "sentimentScore", "type", "updatedAt" FROM "GraphNode";
DROP TABLE "GraphNode";
ALTER TABLE "new_GraphNode" RENAME TO "GraphNode";
CREATE INDEX "GraphNode_type_idx" ON "GraphNode"("type");
CREATE INDEX "GraphNode_parentId_idx" ON "GraphNode"("parentId");
CREATE INDEX "GraphNode_level_idx" ON "GraphNode"("level");
CREATE INDEX "GraphNode_lastNewsAt_idx" ON "GraphNode"("lastNewsAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SubGraph_isActive_sortOrder_idx" ON "SubGraph"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "NodeScoreHistory_nodeId_date_idx" ON "NodeScoreHistory"("nodeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NodeScoreHistory_nodeId_date_key" ON "NodeScoreHistory"("nodeId", "date");

-- CreateIndex
CREATE INDEX "InvestmentSignal_status_triggeredAt_idx" ON "InvestmentSignal"("status", "triggeredAt");

-- CreateIndex
CREATE INDEX "InvestmentSignal_nodeId_idx" ON "InvestmentSignal"("nodeId");

-- CreateIndex
CREATE INDEX "InvestmentSignal_type_idx" ON "InvestmentSignal"("type");
