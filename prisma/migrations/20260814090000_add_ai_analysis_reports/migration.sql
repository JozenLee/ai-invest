-- CreateTable
CREATE TABLE "AIAnalysisReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "dataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AIAnalysisReport_industryId_type_createdAt_idx" ON "AIAnalysisReport"("industryId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysisReport_createdAt_idx" ON "AIAnalysisReport"("createdAt");
