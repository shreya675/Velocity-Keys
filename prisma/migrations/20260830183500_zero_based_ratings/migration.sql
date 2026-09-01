-- Change rating defaults from the old 1200 baseline to a zero-based progression.
ALTER TABLE "User" ALTER COLUMN "rating" SET DEFAULT 0;
ALTER TABLE "Participant" ALTER COLUMN "ratingBefore" SET DEFAULT 0;

-- Convert existing local demo data to the new baseline.
UPDATE "User" SET "rating" = GREATEST("rating" - 1200, 0);
UPDATE "RatingHistory" SET "rating" = GREATEST("rating" - 1200, 0);
UPDATE "Participant" SET "ratingBefore" = GREATEST("ratingBefore" - 1200, 0);
UPDATE "Participant" SET "ratingAfter" = GREATEST("ratingAfter" - 1200, 0) WHERE "ratingAfter" IS NOT NULL;
