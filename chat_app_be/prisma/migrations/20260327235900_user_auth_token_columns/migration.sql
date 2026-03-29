-- Refresh token + password reset fields on User (auth.service)
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetExpires" TIMESTAMP(3);
