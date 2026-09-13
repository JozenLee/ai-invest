PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "riskProfile" TEXT NOT NULL DEFAULT 'moderate',
    "investHorizon" TEXT NOT NULL DEFAULT 'medium',
    "totalAssets" REAL NOT NULL DEFAULT 0,
    "cashRatio" REAL NOT NULL DEFAULT 0.2,
    "minCashRatio" REAL NOT NULL DEFAULT 0.01,
    "maxIndustryRatio" REAL NOT NULL DEFAULT 0.2,
    "maxFundRatio" REAL NOT NULL DEFAULT 0.15,
    "maxSingleAdjustmentRatio" REAL NOT NULL DEFAULT 0.05,
    "stagedAdjustment" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_UserSetting" ("cashRatio", "id", "investHorizon", "maxFundRatio", "maxIndustryRatio", "maxSingleAdjustmentRatio", "minCashRatio", "riskProfile", "stagedAdjustment", "totalAssets", "userId")
SELECT "cashRatio", "id", "investHorizon", "maxFundRatio", "maxIndustryRatio", "maxSingleAdjustmentRatio", "minCashRatio", "riskProfile", "stagedAdjustment", "totalAssets", "userId" FROM "UserSetting";

DROP TABLE "UserSetting";
ALTER TABLE "new_UserSetting" RENAME TO "UserSetting";
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
