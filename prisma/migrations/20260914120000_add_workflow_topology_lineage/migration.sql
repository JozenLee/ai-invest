ALTER TABLE "execution_runs" ADD COLUMN "workflowVersion" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "execution_runs" ADD COLUMN "definitionHash" TEXT;
ALTER TABLE "execution_runs" ADD COLUMN "configSnapshot" TEXT;

ALTER TABLE "execution_steps" ADD COLUMN "methodId" TEXT;
ALTER TABLE "execution_steps" ADD COLUMN "methodVersion" TEXT;
ALTER TABLE "execution_steps" ADD COLUMN "configSnapshot" TEXT;

CREATE TABLE "execution_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stepId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "duration" INTEGER,
  "error" TEXT,
  "methodId" TEXT,
  "methodVersion" TEXT,
  "configSnapshot" TEXT,
  "inputHash" TEXT,
  "outputHash" TEXT,
  CONSTRAINT "execution_attempts_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "execution_steps" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "execution_attempts_stepId_attemptNumber_key" ON "execution_attempts"("stepId", "attemptNumber");
CREATE INDEX "execution_attempts_stepId_startedAt_idx" ON "execution_attempts"("stepId", "startedAt" DESC);

CREATE TABLE "artifact_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stepId" TEXT NOT NULL,
  "attemptId" TEXT,
  "artifactKey" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "dataType" TEXT NOT NULL,
  "data" TEXT,
  "fileUrl" TEXT,
  "size" INTEGER,
  "schemaId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "contentHash" TEXT NOT NULL,
  "sourceAsOf" DATETIME,
  "confidentiality" TEXT NOT NULL DEFAULT 'public',
  "qualityStatus" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_revisions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "execution_steps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "artifact_revisions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "execution_attempts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "artifact_revisions_stepId_artifactKey_createdAt_idx" ON "artifact_revisions"("stepId", "artifactKey", "createdAt" DESC);
CREATE INDEX "artifact_revisions_attemptId_idx" ON "artifact_revisions"("attemptId");
CREATE INDEX "artifact_revisions_contentHash_idx" ON "artifact_revisions"("contentHash");

CREATE TABLE "artifact_lineage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceRevisionId" TEXT NOT NULL,
  "targetRevisionId" TEXT NOT NULL,
  "sourcePort" TEXT NOT NULL,
  "targetPort" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_lineage_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "artifact_revisions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "artifact_lineage_targetRevisionId_fkey" FOREIGN KEY ("targetRevisionId") REFERENCES "artifact_revisions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "artifact_lineage_sourceRevisionId_targetRevisionId_sourcePort_targetPort_key" ON "artifact_lineage"("sourceRevisionId", "targetRevisionId", "sourcePort", "targetPort");
CREATE INDEX "artifact_lineage_targetRevisionId_idx" ON "artifact_lineage"("targetRevisionId");
