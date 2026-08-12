-- CreateTable
CREATE TABLE "GraphNodeIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "indexCode" TEXT NOT NULL,
    "indexName" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "relevance" REAL NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GraphNodeIndex_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GraphNodeIndex_indexCode_idx" ON "GraphNodeIndex"("indexCode");

-- CreateIndex
CREATE INDEX "GraphNodeIndex_nodeId_idx" ON "GraphNodeIndex"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNodeIndex_nodeId_indexCode_key" ON "GraphNodeIndex"("nodeId", "indexCode");
