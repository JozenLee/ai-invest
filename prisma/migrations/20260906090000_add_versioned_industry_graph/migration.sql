CREATE TABLE "industry_graph_tasks" (
    "taskId" TEXT NOT NULL PRIMARY KEY,
    "industryId" TEXT,
    "industryName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "payload" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "industry_graph_tasks_status_updatedAt_idx"
ON "industry_graph_tasks"("status", "updatedAt");
CREATE INDEX "industry_graph_tasks_industryId_updatedAt_idx"
ON "industry_graph_tasks"("industryId", "updatedAt");

CREATE TABLE "graph_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "industryId" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parentRevisionId" TEXT,
    "contentHash" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "reviewedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "graph_revisions_industryId_version_key"
ON "graph_revisions"("industryId", "version");
CREATE INDEX "graph_revisions_industryId_createdAt_idx"
ON "graph_revisions"("industryId", "createdAt");
CREATE INDEX "graph_revisions_contentHash_idx"
ON "graph_revisions"("contentHash");
