ALTER TABLE "UserSetting" ADD COLUMN "minCashRatio" REAL NOT NULL DEFAULT 0.1;
ALTER TABLE "UserSetting" ADD COLUMN "maxIndustryRatio" REAL NOT NULL DEFAULT 0.2;
ALTER TABLE "UserSetting" ADD COLUMN "maxFundRatio" REAL NOT NULL DEFAULT 0.15;
ALTER TABLE "UserSetting" ADD COLUMN "maxSingleAdjustmentRatio" REAL NOT NULL DEFAULT 0.05;
ALTER TABLE "UserSetting" ADD COLUMN "stagedAdjustment" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Holding" ADD COLUMN "fundType" TEXT;
ALTER TABLE "Holding" ADD COLUMN "targetEtfCode" TEXT;
ALTER TABLE "Holding" ADD COLUMN "targetIndexCode" TEXT;
ALTER TABLE "Holding" ADD COLUMN "mappingSource" TEXT;
ALTER TABLE "Holding" ADD COLUMN "mappingConfidence" REAL;
ALTER TABLE "Holding" ADD COLUMN "purchaseDate" DATETIME;
ALTER TABLE "Holding" ADD COLUMN "costNav" REAL;
ALTER TABLE "Holding" ADD COLUMN "redemptionFeePct" REAL;
