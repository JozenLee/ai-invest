-- CreateTable
CREATE TABLE "execution_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "execution_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "duration" INTEGER,
    "error" TEXT,
    "progress" TEXT,
    CONSTRAINT "execution_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "execution_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "step_artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepId" TEXT NOT NULL,
    "artifactKey" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "data" TEXT,
    "fileUrl" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "step_artifacts_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "execution_steps" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "industryDomain" TEXT,
    "industryDomainCode" TEXT,
    "industryDomainSource" TEXT,
    "industryDomainConfidence" REAL,
    "quantity" REAL NOT NULL,
    "unitNav" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Holding" ("category", "id", "industryDomain", "industryDomainCode", "industryDomainConfidence", "industryDomainSource", "market", "name", "portfolioId", "quantity", "ticker", "unitNav", "updatedAt") SELECT "category", "id", "industryDomain", "industryDomainCode", "industryDomainConfidence", "industryDomainSource", "market", "name", "portfolioId", "quantity", "ticker", "unitNav", "updatedAt" FROM "Holding";
DROP TABLE "Holding";
ALTER TABLE "new_Holding" RENAME TO "Holding";
CREATE UNIQUE INDEX "Holding_portfolioId_ticker_key" ON "Holding"("portfolioId", "ticker");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "execution_runs_workflowId_startedAt_idx" ON "execution_runs"("workflowId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "execution_runs_status_idx" ON "execution_runs"("status");

-- CreateIndex
CREATE INDEX "execution_steps_runId_stepIndex_idx" ON "execution_steps"("runId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_runId_stepName_key" ON "execution_steps"("runId", "stepName");

-- CreateIndex
CREATE INDEX "step_artifacts_stepId_idx" ON "step_artifacts"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "step_artifacts_stepId_artifactKey_key" ON "step_artifacts"("stepId", "artifactKey");
