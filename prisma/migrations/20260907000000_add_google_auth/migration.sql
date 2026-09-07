ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
