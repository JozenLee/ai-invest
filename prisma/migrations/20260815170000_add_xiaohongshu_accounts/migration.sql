CREATE TABLE "XiaohongshuAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'oauth',
    "appId" TEXT,
    "appSecret" TEXT,
    "redirectUri" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "defaultVisibility" TEXT NOT NULL DEFAULT 'public',
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultTopics" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" DATETIME,
    "lastVerifyError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "XiaohongshuAccount_enabled_updatedAt_idx" ON "XiaohongshuAccount"("enabled", "updatedAt");
