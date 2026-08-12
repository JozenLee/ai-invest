-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GraphStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "relevance" REAL NOT NULL DEFAULT 1.0,
    "category" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GraphStock_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GraphStock" ("category", "createdAt", "description", "id", "nodeId", "relevance", "stockCode", "stockName", "updatedAt") SELECT "category", "createdAt", "description", "id", "nodeId", "relevance", "stockCode", "stockName", "updatedAt" FROM "GraphStock";
DROP TABLE "GraphStock";
ALTER TABLE "new_GraphStock" RENAME TO "GraphStock";
CREATE UNIQUE INDEX "GraphStock_nodeId_stockCode_key" ON "GraphStock"("nodeId", "stockCode");
CREATE INDEX "GraphStock_nodeId_idx" ON "GraphStock"("nodeId");
CREATE INDEX "GraphStock_stockCode_idx" ON "GraphStock"("stockCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
