CREATE TABLE "DailyChallenge" (
    "id" TEXT NOT NULL,
    "challengeDate" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 60,
    "textMode" "TextMode" NOT NULL DEFAULT 'PROSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyChallengeEntry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "consistency" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "score" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyChallenge_challengeDate_key" ON "DailyChallenge"("challengeDate");
CREATE UNIQUE INDEX "DailyChallengeEntry_challengeId_userId_key" ON "DailyChallengeEntry"("challengeId", "userId");

ALTER TABLE "DailyChallengeEntry" ADD CONSTRAINT "DailyChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyChallengeEntry" ADD CONSTRAINT "DailyChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
