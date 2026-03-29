-- Track which staff member issued a room ban (owner / room admin).
ALTER TABLE "RoomBan" ADD COLUMN "bannedById" UUID;

CREATE INDEX "RoomBan_bannedById_idx" ON "RoomBan"("bannedById");

ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
