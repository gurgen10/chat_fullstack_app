-- Add username (immutable app-level; unique DB-level)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill for existing rows (if any)
UPDATE "User"
SET "username" = CONCAT('user_', REPLACE(CAST("id" AS TEXT), '-', ''))
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

