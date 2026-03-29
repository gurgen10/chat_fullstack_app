-- Reply / reference to another message in the same room (UTF-8 text limit enforced in app).
ALTER TABLE "Message" ADD COLUMN "replyToId" UUID;

CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
