ALTER TABLE "Holding" ADD COLUMN "unitNav" REAL;

UPDATE "Holding"
SET "unitNav" = "avgCost"
WHERE "unitNav" IS NULL;
