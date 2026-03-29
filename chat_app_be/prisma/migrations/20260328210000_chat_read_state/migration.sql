-- CreateTable
CREATE TABLE "ChatReadState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "lastReadMessageId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadState_userId_roomId_key" ON "ChatReadState"("userId", "roomId");

-- CreateIndex
CREATE INDEX "ChatReadState_userId_idx" ON "ChatReadState"("userId");

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
