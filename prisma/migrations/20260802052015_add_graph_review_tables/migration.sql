-- CreateTable
CREATE TABLE "graph_update_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "industryId" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "oldVersion" TEXT NOT NULL,
    "newVersion" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT
);

-- CreateTable
CREATE TABLE "graph_change_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "graph_change_approvals_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "graph_update_reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "graph_update_reviews_status_createdAt_idx" ON "graph_update_reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "graph_update_reviews_industryId_idx" ON "graph_update_reviews"("industryId");

-- CreateIndex
CREATE INDEX "graph_change_approvals_reviewId_idx" ON "graph_change_approvals"("reviewId");

-- CreateIndex
CREATE INDEX "graph_change_approvals_changeId_idx" ON "graph_change_approvals"("changeId");
