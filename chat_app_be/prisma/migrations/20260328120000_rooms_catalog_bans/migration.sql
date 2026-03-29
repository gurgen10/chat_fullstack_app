-- Room staff role
ALTER TYPE "RoomMemberRole" ADD VALUE 'admin';

-- Room description (2.4.2)
ALTER TABLE "Room" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

-- Bans from a specific chat room (2.4.2 / 2.4.3)
CREATE TABLE "RoomBan" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomBan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomBan_roomId_userId_key" ON "RoomBan"("roomId", "userId");
CREATE INDEX "RoomBan_userId_idx" ON "RoomBan"("userId");

ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique non-null room names (PostgreSQL allows multiple NULLs for DMs)
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");
