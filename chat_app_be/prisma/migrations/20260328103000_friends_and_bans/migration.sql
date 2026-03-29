-- Optional note on friend requests
ALTER TABLE "Friendship" ADD COLUMN "requestMessage" TEXT;

-- Directional ban: banner blocks bannedUser from contacting them; DM rules treat any ban between a pair as blocking new messages both ways.
CREATE TABLE "UserBan" (
    "id" UUID NOT NULL,
    "bannerId" UUID NOT NULL,
    "bannedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBan_bannerId_bannedUserId_key" ON "UserBan"("bannerId", "bannedUserId");
CREATE INDEX "UserBan_bannedUserId_idx" ON "UserBan"("bannedUserId");

ALTER TABLE "UserBan" ADD CONSTRAINT "UserBan_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBan" ADD CONSTRAINT "UserBan_bannedUserId_fkey" FOREIGN KEY ("bannedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
