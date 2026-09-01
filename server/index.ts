import "dotenv/config";
import http from "node:http";
import express from "express";
import next from "next";
import { Server } from "socket.io";
import { TextMode } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { levelForRating, practiceRatingDelta, practiceScore } from "../lib/race-math";
import type { CodeLanguage, DailyChallengeSummary, FriendsSummary, KeystrokePayload, LeaderboardSummary, LeaderboardUser, PracticeDifficulty, PracticeHistoryItem, PracticeMode, PublicRoomSummary, VocabularyEntry } from "../lib/types";
import { login, register, requireAuth, userFromToken } from "./auth";
import { RaceService } from "./race-service";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();
const races = new RaceService();

async function main() {
  await app.prepare();

  const expressApp = express();
  expressApp.use(express.json({ limit: "1mb" }));

  expressApp.post("/api/auth/register", register);
  expressApp.post("/api/auth/login", login);

  expressApp.get("/api/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  expressApp.post("/api/rooms", requireAuth, async (req, res) => {
    try {
      const textMode = normalizeTextMode(req.body.textMode);
      const raceMode = normalizePracticeMode(req.body.raceMode ?? req.body.practiceMode);
      const codeLanguage = normalizeCodeLanguage(req.body.codeLanguage);
      const difficulty = normalizeDifficulty(req.body.difficulty);
      const durationSeconds = normalizeRaceDuration(req.body.durationSeconds);
      const snapshot = await races.createRoom(req.user!, Boolean(req.body.isPrivate ?? true), textMode, req.body.customText, codeLanguage, difficulty, durationSeconds, raceMode);
      res.json(snapshot);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Could not create room." });
    }
  });

  expressApp.post("/api/rooms/:code/join", requireAuth, async (req, res) => {
    try {
      const snapshot = await races.joinRoom(req.params.code, req.user!, Boolean(req.body.spectator));
      res.json(snapshot);
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : "Room not found." });
    }
  });

  expressApp.get("/api/rooms/public", requireAuth, async (_req, res) => {
    const rooms: PublicRoomSummary[] = races.publicRooms();
    res.json({ rooms });
  });

  expressApp.delete("/api/rooms/:code/leave", requireAuth, async (req, res) => {
    try {
      const result = races.leaveRoom(req.params.code, req.user!.id);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : "Room not found." });
    }
  });

  expressApp.post("/api/matchmaking", requireAuth, async (req, res) => {
    const snapshot = await races.enterMatchmaking(req.user!, {
      textMode: normalizeTextMode(req.body.textMode),
      raceMode: normalizePracticeMode(req.body.raceMode ?? req.body.practiceMode),
      codeLanguage: normalizeCodeLanguage(req.body.codeLanguage),
      difficulty: normalizeDifficulty(req.body.difficulty),
      durationSeconds: normalizeRaceDuration(req.body.durationSeconds)
    });
    res.json({ matched: Boolean(snapshot), snapshot });
  });

  expressApp.delete("/api/matchmaking", requireAuth, async (req, res) => {
    races.leaveMatchmaking(req.user!.id);
    res.json({ ok: true });
  });

  expressApp.get("/api/analytics", requireAuth, async (req, res) => {
    const participants = await prisma.participant.findMany({
      where: { userId: req.user!.id, isSpectator: false, finishedAt: { not: null } },
      orderBy: { finishedAt: "asc" },
      include: { race: true }
    });
    const ratings = await prisma.ratingHistory.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" }
    });
    const weak = await prisma.practiceStat.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ mistakes: "desc" }, { attempts: "desc" }],
      take: 16
    });

    res.json({
      wpmTrend: participants.map((p) => ({ date: p.finishedAt!.toISOString(), wpm: Math.round(p.wpm) })),
      accuracyTrend: participants.map((p) => ({ date: p.finishedAt!.toISOString(), accuracy: Math.round(p.accuracy * 10) / 10 })),
      ratingHistory: ratings.map((r) => ({ date: r.createdAt.toISOString(), rating: r.rating, delta: r.delta })),
      weakLetters: weak.filter((item) => item.tokenType === "letter").slice(0, 8),
      weakWords: weak.filter((item) => item.tokenType === "word").slice(0, 8),
      consistency: Math.round(avg(participants.map((p) => p.consistency)) || 100),
      recentRaces: [...participants].reverse().slice(0, 8).map((p) => ({
        id: p.raceId,
        date: p.finishedAt!.toISOString(),
        wpm: Math.round(p.wpm),
        accuracy: Math.round(p.accuracy * 10) / 10,
        placement: p.placement ?? undefined,
        cheatFlags: p.cheatFlags
      }))
    });
  });

  expressApp.get("/api/leaderboard", requireAuth, async (req, res) => {
    const scope = req.query.scope === "friends" ? "friends" : "public";
    const users = await leaderboardUsers(req.user!.id, scope);
    const payload: LeaderboardSummary = { scope, users };
    res.json(payload);
  });

  expressApp.get("/api/profile/:userId", requireAuth, async (req, res) => {
    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.userId === "me" ? req.user!.id : req.params.userId }
    });
    if (!targetUser) return res.status(404).json({ error: "User not found." });
    res.json({ user: await leaderboardUser(targetUser) });
  });

  expressApp.get("/api/friends", requireAuth, async (req, res) => {
    res.json(await friendsSummary(req.user!.id));
  });

  expressApp.post("/api/friends/request", requireAuth, async (req, res) => {
    const username = String(req.body.username ?? "").trim();
    if (!username) return res.status(400).json({ error: "Enter a username to add." });
    const targetUser = await prisma.user.findUnique({ where: { username } });
    if (!targetUser) return res.status(404).json({ error: "User not found." });
    if (targetUser.id === req.user!.id) return res.status(400).json({ error: "You cannot add yourself." });

    const reverseRequest = await prisma.friendRequest.findUnique({
      where: { requesterId_addresseeId: { requesterId: targetUser.id, addresseeId: req.user!.id } }
    });
    if (reverseRequest?.status === "PENDING") {
      await prisma.friendRequest.update({
        where: { id: reverseRequest.id },
        data: { status: "ACCEPTED", respondedAt: new Date() }
      });
      return res.json(await friendsSummary(req.user!.id));
    }
    if (reverseRequest?.status === "ACCEPTED") return res.json(await friendsSummary(req.user!.id));

    await prisma.friendRequest.upsert({
      where: { requesterId_addresseeId: { requesterId: req.user!.id, addresseeId: targetUser.id } },
      update: { status: "PENDING", respondedAt: null },
      create: { requesterId: req.user!.id, addresseeId: targetUser.id }
    });
    res.json(await friendsSummary(req.user!.id));
  });

  expressApp.post("/api/friends/:requestId/respond", requireAuth, async (req, res) => {
    const status = req.body.accept === true ? "ACCEPTED" : "REJECTED";
    const request = await prisma.friendRequest.findFirst({
      where: { id: req.params.requestId, addresseeId: req.user!.id, status: "PENDING" }
    });
    if (!request) return res.status(404).json({ error: "Friend request not found." });
    await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status, respondedAt: new Date() }
    });
    res.json(await friendsSummary(req.user!.id));
  });

  expressApp.get("/api/daily-challenge", requireAuth, async (req, res) => {
    const challenge = await getOrCreateDailyChallenge();
    res.json(await dailyChallengeSummary(challenge.id, req.user!.id));
  });

  expressApp.post("/api/daily-challenge/result", requireAuth, async (req, res) => {
    const challenge = await prisma.dailyChallenge.findUnique({ where: { id: String(req.body.challengeId ?? "") } });
    if (!challenge) return res.status(404).json({ error: "Daily challenge not found." });

    const wpm = clampNumber(req.body.wpm, 0, 300);
    const accuracy = clampNumber(req.body.accuracy, 0, 100);
    const consistency = clampNumber(req.body.consistency, 0, 100);
    const errors = Math.round(clampNumber(req.body.errors, 0, 10000));
    const durationSeconds = normalizeDuration(req.body.durationSeconds ?? challenge.durationSeconds);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const score = practiceScore({ wpm, accuracy, consistency, errors, durationSeconds, currentRating: user.rating, difficulty: "MEDIUM" });
    const existing = await prisma.dailyChallengeEntry.findUnique({
      where: { challengeId_userId: { challengeId: challenge.id, userId: user.id } }
    });

    if (!existing || score > existing.score || (score === existing.score && wpm > existing.wpm)) {
      await prisma.dailyChallengeEntry.upsert({
        where: { challengeId_userId: { challengeId: challenge.id, userId: user.id } },
        update: { wpm, accuracy, consistency, score, errors, durationSeconds, completedAt: new Date() },
        create: { challengeId: challenge.id, userId: user.id, wpm, accuracy, consistency, score, errors, durationSeconds }
      });
    }
    await awardAchievements(user.id, { source: "daily", wpm, accuracy, consistency, score, errors });

    res.json(await dailyChallengeSummary(challenge.id, user.id));
  });

  expressApp.get("/api/practice", requireAuth, async (req, res) => {
    const mode = normalizePracticeMode(req.query.mode);
    const durationSeconds = normalizeDuration(req.query.duration);
    const difficulty = normalizeDifficulty(req.query.difficulty);
    const codeLanguage = normalizeCodeLanguage(req.query.codeLanguage);
    const weak = await prisma.practiceStat.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ mistakes: "desc" }, { attempts: "desc" }],
      take: 10
    });
    const tokens = weak.map((item) => item.token);
    const practice = buildPracticePrompt(mode, durationSeconds, difficulty, tokens, codeLanguage);
    res.json({ ...practice, weak, mode, durationSeconds, difficulty, codeLanguage });
  });

  expressApp.get("/api/practice/history", requireAuth, async (req, res) => {
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const history: PracticeHistoryItem[] = sessions.map((session) => ({
      id: session.id,
      mode: normalizePracticeMode(session.mode),
      difficulty: normalizeDifficulty(session.difficulty),
      codeLanguage: normalizeCodeLanguage(session.codeLanguage),
      durationSeconds: session.durationSeconds,
      wpm: Math.round(session.wpm),
      accuracy: Math.round(session.accuracy * 10) / 10,
      consistency: Math.round(session.consistency),
      score: session.score,
      createdAt: session.createdAt.toISOString()
    }));
    res.json({ history });
  });

  expressApp.post("/api/practice/result", requireAuth, async (req, res) => {
    const durationSeconds = normalizeDuration(req.body.durationSeconds);
    const difficulty = normalizeDifficulty(req.body.difficulty);
    const mode = normalizePracticeMode(req.body.mode);
    const codeLanguage = normalizeCodeLanguage(req.body.codeLanguage);
    const wpm = clampNumber(req.body.wpm, 0, 300);
    const accuracy = clampNumber(req.body.accuracy, 0, 100);
    const consistency = clampNumber(req.body.consistency, 0, 100);
    const errors = Math.round(clampNumber(req.body.errors, 0, 10000));
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const score = practiceScore({ wpm, accuracy, consistency, errors, durationSeconds, currentRating: user.rating, difficulty });
    const delta = practiceRatingDelta({ score, errors, accuracy, consistency, currentRating: user.rating, difficulty });
    const ratingAfter = Math.max(0, user.rating + delta);

    await prisma.user.update({ where: { id: user.id }, data: { rating: ratingAfter } });
    await prisma.ratingHistory.create({
      data: { userId: user.id, rating: ratingAfter, delta }
    });
    await prisma.practiceSession.create({
      data: {
        userId: user.id,
        durationSeconds,
        mode,
        difficulty,
        codeLanguage,
        wpm,
        accuracy,
        consistency,
        score
      }
    });
    await recordPracticeWeakStats(user.id, String(req.body.prompt ?? ""), Array.isArray(req.body.events) ? req.body.events : []);
    await awardAchievements(user.id, { source: "practice", wpm, accuracy, consistency, score, errors });

    res.json({
      wpm,
      accuracy,
      consistency,
      score,
      ratingBefore: user.rating,
      ratingAfter,
      delta,
      level: levelForRating(ratingAfter),
      difficulty,
      vocabulary: Array.isArray(req.body.vocabulary) ? req.body.vocabulary.slice(0, 20) : undefined
    });
  });

  expressApp.get("/api/races/:raceId/ghost/:userId", requireAuth, async (req, res) => {
    const replay = await races.ghostReplay(req.params.raceId, req.params.userId);
    res.json({ replay });
  });

  expressApp.all("*", (req, res) => handle(req, res));

  const server = http.createServer(expressApp);
  const io = new Server(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" }
  });

  io.use(async (socket, nextSocket) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.toString().replace("Bearer ", "");
    const user = await userFromToken(token);
    if (!user) return nextSocket(new Error("Authentication required."));
    socket.data.user = user;
    return nextSocket();
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async ({ code, spectator }: { code: string; spectator?: boolean }, ack?: (payload: unknown) => void) => {
      try {
        const snapshot = await races.joinRoom(code, socket.data.user, spectator);
        socket.join(snapshot.roomCode);
        io.to(snapshot.roomCode).emit("race:snapshot", snapshot);
        ack?.({ ok: true, snapshot });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not join room." });
      }
    });

    socket.on("room:leave", ({ code }: { code: string }, ack?: (payload: unknown) => void) => {
      try {
        const result = races.leaveRoom(code, socket.data.user.id);
        socket.leave(result.snapshot.roomCode);
        io.to(result.snapshot.roomCode).emit("race:snapshot", result.snapshot);
        ack?.({ ok: true, snapshot: result.snapshot });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not leave room." });
      }
    });

    socket.on("race:start", ({ code }: { code: string }, ack?: (payload: unknown) => void) => {
      try {
        const snapshot = races.startCountdown(code, socket.data.user);
        io.to(snapshot.roomCode).emit("race:snapshot", snapshot);
        ack?.({ ok: true, snapshot });
        if (snapshot.status === "COUNTDOWN") {
          setTimeout(() => io.to(snapshot.roomCode).emit("race:snapshot", races.snapshotByCode(snapshot.roomCode)), 5050);
          setTimeout(async () => {
            const finished = await races.finishByTimeout(snapshot.roomCode);
            io.to(finished.roomCode).emit("race:snapshot", finished);
          }, snapshot.durationSeconds * 1000 + 5200);
        }
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not start race." });
      }
    });

    socket.on("race:keystroke", ({ code, event }: { code: string; event: KeystrokePayload }) => {
      const snapshot = races.recordKeystroke(code, socket.data.user, event);
      io.to(snapshot.roomCode).emit("race:snapshot", snapshot);
    });
  });

  server.listen(port, () => {
    console.log(`Velocity Keys is ready on http://localhost:${port}`);
  });
}

function normalizeTextMode(value: unknown) {
  if (value === "CODE") return TextMode.CODE;
  if (value === "QUOTE") return TextMode.QUOTE;
  if (value === "CUSTOM") return TextMode.CUSTOM;
  return TextMode.PROSE;
}

async function leaderboardUsers(currentUserId: string, scope: "public" | "friends") {
  const friendIds = scope === "friends" ? await acceptedFriendIds(currentUserId) : [];
  if (scope === "friends" && friendIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: scope === "friends" ? { id: { in: friendIds } } : undefined,
    orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
    take: 50
  });

  const rows = await Promise.all(users.map((user) => leaderboardUser(user)));
  return rows.sort((a, b) => b.rating - a.rating || b.bestWpm - a.bestWpm);
}

async function friendsSummary(currentUserId: string): Promise<FriendsSummary> {
  const requests = await prisma.friendRequest.findMany({
    where: {
      OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }]
    },
    include: { requester: true, addressee: true },
    orderBy: { createdAt: "desc" }
  });
  const acceptedIds = new Set<string>();
  for (const request of requests) {
    if (request.status === "ACCEPTED") {
      acceptedIds.add(request.requesterId === currentUserId ? request.addresseeId : request.requesterId);
    }
  }
  const friends = await prisma.user.findMany({
    where: { id: { in: Array.from(acceptedIds) } },
    orderBy: [{ rating: "desc" }, { username: "asc" }]
  });
  return {
    friends: friends.map(friendUser),
    incoming: requests.filter((request) => request.addresseeId === currentUserId && request.status === "PENDING").map(friendRequestSummary),
    outgoing: requests.filter((request) => request.requesterId === currentUserId && request.status === "PENDING").map(friendRequestSummary)
  };
}

async function acceptedFriendIds(currentUserId: string) {
  const requests = await prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }]
    },
    select: { requesterId: true, addresseeId: true }
  });
  return requests.map((request) => request.requesterId === currentUserId ? request.addresseeId : request.requesterId);
}

function friendRequestSummary(request: {
  id: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  requester: { id: string; username: string; rating: number };
  addressee: { id: string; username: string; rating: number };
}) {
  return {
    id: request.id,
    status: request.status as "PENDING" | "ACCEPTED" | "REJECTED",
    createdAt: request.createdAt.toISOString(),
    respondedAt: request.respondedAt?.toISOString(),
    requester: friendUser(request.requester),
    addressee: friendUser(request.addressee)
  };
}

function friendUser(user: { id: string; username: string; rating: number }) {
  return {
    id: user.id,
    username: user.username,
    rating: user.rating,
    level: levelForRating(user.rating)
  };
}

async function leaderboardUser(user: { id: string; username: string; rating: number; createdAt: Date }): Promise<LeaderboardUser> {
  const [raceStats, practiceStats, podiums, wins, achievements] = await Promise.all([
    prisma.participant.aggregate({
      where: { userId: user.id, isSpectator: false, finishedAt: { not: null } },
      _count: { _all: true },
      _max: { wpm: true },
      _avg: { wpm: true, accuracy: true, consistency: true }
    }),
    prisma.practiceSession.aggregate({
      where: { userId: user.id },
      _count: { _all: true },
      _sum: { durationSeconds: true },
      _max: { wpm: true },
      _avg: { wpm: true, accuracy: true, consistency: true }
    }),
    prisma.participant.count({ where: { userId: user.id, placement: { lte: 3 }, finishedAt: { not: null } } }),
    prisma.participant.count({ where: { userId: user.id, placement: 1, finishedAt: { not: null } } }),
    prisma.achievement.findMany({ where: { userId: user.id }, orderBy: { earnedAt: "asc" } })
  ]);

  const bestWpm = Math.max(raceStats._max.wpm ?? 0, practiceStats._max.wpm ?? 0);
  const raceCount = raceStats._count._all;
  const practiceCount = practiceStats._count._all;
  const averageWpm = weightedAverage(raceStats._avg.wpm, raceCount, practiceStats._avg.wpm, practiceCount);
  const averageAccuracy = weightedAverage(raceStats._avg.accuracy, raceCount, practiceStats._avg.accuracy, practiceCount, 100);
  const consistency = weightedAverage(raceStats._avg.consistency, raceCount, practiceStats._avg.consistency, practiceCount, 100);

  return {
    id: user.id,
    username: user.username,
    rating: user.rating,
    level: levelForRating(user.rating),
    joinedAt: user.createdAt.toISOString(),
    racesDone: raceCount,
    practiceTestsDone: practiceCount,
    totalTypingSeconds: practiceStats._sum.durationSeconds ?? 0,
    bestWpm: Math.round(bestWpm),
    averageWpm: Math.round(averageWpm),
    averageAccuracy: Math.round(averageAccuracy * 10) / 10,
    consistency: Math.round(consistency),
    podiums,
    wins,
    achievements: achievements.map((achievement) => ({
      code: achievement.code,
      title: achievement.title,
      description: achievement.description,
      category: achievement.category,
      earnedAt: achievement.earnedAt.toISOString()
    }))
  };
}

async function getOrCreateDailyChallenge() {
  const challengeDate = dailyChallengeDate();
  const existing = await prisma.dailyChallenge.findUnique({ where: { challengeDate } });
  if (existing) return existing;
  return prisma.dailyChallenge.create({
    data: {
      challengeDate,
      durationSeconds: 60,
      textMode: TextMode.PROSE,
      prompt: dailyPromptForDate(challengeDate)
    }
  });
}

async function dailyChallengeSummary(challengeId: string, currentUserId: string): Promise<DailyChallengeSummary> {
  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id: challengeId },
    include: {
      entries: {
        orderBy: [{ score: "desc" }, { wpm: "desc" }, { accuracy: "desc" }, { completedAt: "asc" }],
        include: { user: true },
        take: 50
      }
    }
  });
  if (!challenge) throw new Error("Daily challenge not found.");
  const leaderboard = challenge.entries.map((entry) => ({
    userId: entry.userId,
    username: entry.user.username,
    rating: entry.user.rating,
    level: levelForRating(entry.user.rating),
    wpm: Math.round(entry.wpm),
    accuracy: Math.round(entry.accuracy * 10) / 10,
    consistency: Math.round(entry.consistency),
    score: entry.score,
    errors: entry.errors,
    durationSeconds: entry.durationSeconds,
    completedAt: entry.completedAt.toISOString()
  }));
  return {
    id: challenge.id,
    challengeDate: challenge.challengeDate,
    prompt: challenge.prompt,
    durationSeconds: challenge.durationSeconds,
    textMode: challenge.textMode,
    leaderboard,
    myEntry: leaderboard.find((entry) => entry.userId === currentUserId)
  };
}

function dailyChallengeDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dailyPromptForDate(challengeDate: string) {
  const seed = challengeDate.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const prompt = dailyChallengePrompts[seed % dailyChallengePrompts.length];
  const wordBank = wordsForDifficulty(seed % 3 === 0 ? "HARD" : seed % 3 === 1 ? "MEDIUM" : "EASY");
  const tail = Array.from({ length: 80 }, (_, index) => wordBank[(seed + index * 7) % wordBank.length]).join(" ");
  return `${prompt} ${tail}`;
}

async function awardAchievements(
  userId: string,
  result: { source: "practice" | "daily"; wpm: number; accuracy: number; consistency: number; score: number; errors: number }
) {
  const [practiceCount, dailyCount] = await Promise.all([
    prisma.practiceSession.count({ where: { userId } }),
    prisma.dailyChallengeEntry.count({ where: { userId } })
  ]);
  const unlocked = achievementCatalog.filter((achievement) => achievement.isUnlocked({ ...result, practiceCount, dailyCount }));
  await Promise.all(unlocked.map((achievement) => prisma.achievement.upsert({
    where: { userId_code: { userId, code: achievement.code } },
    update: {},
    create: {
      userId,
      code: achievement.code,
      title: achievement.title,
      description: achievement.description,
      category: achievement.category
    }
  })));
}

async function racedUserIds(currentUserId: string) {
  const myRaces = await prisma.participant.findMany({
    where: { userId: currentUserId, isSpectator: false },
    select: { raceId: true }
  });
  if (!myRaces.length) return [];
  const peers = await prisma.participant.findMany({
    where: {
      raceId: { in: myRaces.map((participant) => participant.raceId) },
      userId: { not: currentUserId },
      isSpectator: false
    },
    distinct: ["userId"],
    select: { userId: true }
  });
  return peers.map((peer) => peer.userId);
}

function weightedAverage(first: number | null, firstCount: number, second: number | null, secondCount: number, fallback = 0) {
  const total = firstCount + secondCount;
  if (!total) return fallback;
  return (((first ?? 0) * firstCount) + ((second ?? 0) * secondCount)) / total;
}

function normalizePracticeMode(value: unknown): PracticeMode {
  if (value === "VOCAB") return "VOCAB";
  if (value === "QUOTE") return "QUOTE";
  if (value === "CODE") return "CODE";
  if (value === "WORDS") return "WORDS";
  if (value === "ADAPTIVE") return "ADAPTIVE";
  return "STORY";
}

function normalizeDifficulty(value: unknown): PracticeDifficulty {
  if (value === "EASY") return "EASY";
  if (value === "HARD") return "HARD";
  if (value === "EXPERT") return "EXPERT";
  return "MEDIUM";
}

function normalizeCodeLanguage(value: unknown): CodeLanguage {
  if (value === "JAVASCRIPT") return "JAVASCRIPT";
  if (value === "PYTHON") return "PYTHON";
  if (value === "JAVA") return "JAVA";
  if (value === "SQL") return "SQL";
  return "CPP";
}

function normalizeDuration(value: unknown) {
  const duration = Math.floor(Number(value));
  if (!Number.isFinite(duration)) return 60;
  return Math.max(1, Math.min(900, duration));
}

function normalizeRaceDuration(value: unknown) {
  const duration = Math.floor(Number(value));
  if (!Number.isFinite(duration)) return 120;
  return Math.max(120, Math.min(900, duration));
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

async function recordPracticeWeakStats(userId: string, prompt: string, events: KeystrokePayload[]) {
  const wrong = events.filter((event) => !event.correct && event.expected);
  for (const event of wrong) {
    await prisma.practiceStat.upsert({
      where: { userId_token_tokenType: { userId, token: event.expected.toLowerCase(), tokenType: "letter" } },
      update: { attempts: { increment: 1 }, mistakes: { increment: 1 } },
      create: { userId, token: event.expected.toLowerCase(), tokenType: "letter", attempts: 1, mistakes: 1 }
    });
  }
  for (const word of wordsWithMistakes(prompt, wrong.map((event) => event.index))) {
    await prisma.practiceStat.upsert({
      where: { userId_token_tokenType: { userId, token: word.toLowerCase(), tokenType: "word" } },
      update: { attempts: { increment: 1 }, mistakes: { increment: 1 } },
      create: { userId, token: word.toLowerCase(), tokenType: "word", attempts: 1, mistakes: 1 }
    });
  }
}

function wordsWithMistakes(prompt: string, indexes: number[]) {
  const ranges: { word: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const word of prompt.split(/\s+/)) {
    const start = prompt.indexOf(word, cursor);
    const end = start + word.length;
    ranges.push({ word, start, end });
    cursor = end;
  }
  return Array.from(new Set(ranges.filter((range) => indexes.some((index) => index >= range.start && index < range.end)).map((range) => range.word)));
}

function buildPracticePrompt(mode: PracticeMode, durationSeconds: number, difficulty: PracticeDifficulty, weakTokens: string[], codeLanguage: CodeLanguage) {
  const repeats = Math.max(5, Math.min(24, Math.ceil(durationSeconds / 20)));
  if (mode === "VOCAB") {
    const vocabulary = pickVocabulary(difficulty, Math.max(16, Math.min(40, Math.ceil(durationSeconds / 6))));
    return {
      prompt: vocabulary.map((entry) => entry.example).join(" "),
      vocabulary
    };
  }

  const banks: Record<Exclude<PracticeMode, "VOCAB">, string[]> = {
    STORY: [
      "The rain tapped against the window while the terminal waited for one clean command. Each word arrived like a small decision, and each correction made the next sentence easier to trust.",
      "Morning light crossed the desk as the keys settled into a steady rhythm. The goal was not to rush, but to keep moving with enough calm to notice every mistake before it grew.",
      "The old notebook was full of crossed-out plans, short reminders, and tiny victories. By the time the page ended, the work felt less like pressure and more like direction.",
      "A quiet room can make progress sound louder. The typist followed the line, fixed the errors, and found that consistency was simply patience repeated at speed.",
      "The project looked complicated from far away, but each sentence made it smaller. One clear thought became the next, and soon the whole problem had edges."
    ],
    QUOTE: [
      "It always seems impossible until it is done.",
      "The secret of getting ahead is getting started.",
      "Well done is better than well said.",
      "The only way to do great work is to love what you do.",
      "Quality is not an act, it is a habit.",
      "Do what you can, with what you have, where you are.",
      "The journey of a thousand miles begins with one step.",
      "Simplicity is the ultimate sophistication.",
      "Whether you think you can or you think you cannot, you are right.",
      "Success is not final, failure is not fatal, it is the courage to continue that counts."
    ],
    CODE: codeSnippets[codeLanguage],
    WORDS: [
      makeWordStream(220, difficulty),
      makeWordStream(220, difficulty),
      makeWordStream(220, difficulty)
    ],
    ADAPTIVE: weakTokens.length
      ? [
          `${weakTokens.join(" ")} ${weakTokens.slice().reverse().join(" ")}`,
          `steady ${weakTokens.join(" steady ")} clean ${weakTokens.join(" clean ")}`,
          "slow is smooth and smooth becomes fast when the hard letters stop surprising you"
        ]
      : [
          "adaptive practice begins after you finish a few races with mistakes",
          "steady letters clear rhythm honest correction focused hands",
          "common words become faster when accuracy stays calm"
        ]
  };

  const selected = banks[mode];
  const difficultyRepeats = difficulty === "EXPERT" ? repeats + 2 : difficulty === "HARD" ? repeats + 1 : repeats;
  return {
    prompt: Array.from({ length: difficultyRepeats }, () => selected[Math.floor(Math.random() * selected.length)]).join(mode === "CODE" ? "\n\n" : " "),
    vocabulary: []
  };
}

function makeWordStream(count: number, difficulty: PracticeDifficulty) {
  const words = wordsForDifficulty(difficulty);
  return Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
}

function wordsForDifficulty(difficulty: PracticeDifficulty) {
  const easyWords = [
    "about", "above", "again", "always", "answer", "around", "basic", "before", "better", "bright", "camera", "chance", "change", "choice",
    "circle", "common", "course", "create", "during", "effect", "effort", "energy", "family", "faster", "finish", "follow", "format", "friend",
    "future", "garden", "ground", "handle", "happen", "inside", "island", "leader", "letter", "little", "market", "memory", "method", "minute",
    "modern", "moment", "motion", "notice", "office", "option", "period", "person", "phrase", "planet", "player", "public", "quality", "random",
    "rating", "reason", "record", "render", "repair", "repeat", "report", "result", "rhythm", "screen", "second", "select", "service", "signal",
    "simple", "smooth", "stable", "steady", "stream", "system", "target", "thread", "timing", "typing", "useful", "value", "window", "winner"
  ];
  const mediumWords = [
    "ability", "about", "above", "accept", "across", "action", "active", "actual", "adapt", "again", "almost", "always", "answer", "appear",
    "around", "arrive", "artist", "attack", "author", "balance", "basic", "become", "before", "behind", "better", "between", "beyond", "branch",
    "bright", "broken", "budget", "camera", "career", "center", "chance", "change", "charge", "choice", "circle", "client", "column", "common",
    "control", "corner", "course", "create", "custom", "damage", "danger", "decide", "degree", "design", "detail", "direct", "doctor", "double",
    "during", "effect", "effort", "energy", "engine", "enough", "entire", "escape", "event", "example", "expect", "factor", "family", "faster",
    "figure", "filter", "finger", "finish", "follow", "format", "friend", "future", "garden", "global", "ground", "growth", "handle", "happen",
    "honest", "impact", "inside", "island", "keyboard", "language", "leader", "letter", "little", "logic", "market", "memory", "method", "minute",
    "modern", "moment", "motion", "nation", "notice", "object", "office", "option", "output", "packet", "parent", "period", "person", "phrase",
    "planet", "player", "policy", "practice", "private", "process", "program", "public", "quality", "question", "random", "rating", "reason",
    "record", "reduce", "render", "repair", "repeat", "report", "result", "rhythm", "screen", "search", "second", "select", "service", "signal",
    "simple", "smooth", "socket", "source", "stable", "steady", "stream", "system", "target", "thread", "timing", "toward", "typing", "useful",
    "value", "window", "winner", "wonder", "worker", "yellow"
  ];
  const hardWords = [
    "aberration", "abstract", "ambiguous", "analyze", "anomaly", "argument", "attribute", "brevity", "coherent", "complex", "compound", "context",
    "contrast", "criteria", "definite", "delegate", "density", "dynamic", "efficient", "elaborate", "emphasis", "evaluate", "evidence", "explicit",
    "fragment", "implicit", "inference", "integral", "interval", "junction", "luminous", "magnitude", "mechanism", "meticulous", "momentum",
    "notation", "objective", "parallel", "parameter", "perceive", "precise", "priority", "protocol", "rational", "sequence", "simulate",
    "strategy", "structure", "synthesis", "terminal", "validate", "velocity"
  ];
  const expertWords = [
    "access", "account", "actually", "address", "already", "although", "another", "because", "believe", "business", "calendar", "carefully",
    "challenge", "comfortable", "committee", "communication", "community", "complete", "condition", "connection", "consider", "continue",
    "different", "difficult", "direction", "education", "especially", "everything", "experience", "favorite", "February", "government",
    "guarantee", "important", "including", "information", "interesting", "language", "necessary", "occasionally", "opportunity", "original",
    "particular", "personal", "possible", "probably", "professional", "question", "receive", "remember", "restaurant", "schedule", "separate",
    "similar", "sincerely", "successful", "surprise", "temperature", "together", "tomorrow", "usually", "wednesday", "wonderful"
  ];
  if (difficulty === "EXPERT") return expertWords;
  if (difficulty === "HARD") return hardWords;
  if (difficulty === "EASY") return easyWords;
  return mediumWords;
}

function pickVocabulary(difficulty: PracticeDifficulty, count: number) {
  const source = difficulty === "EASY"
    ? vocabularyBank.filter((entry) => entry.level !== "EXPERT")
    : difficulty === "MEDIUM"
      ? vocabularyBank.filter((entry) => entry.level !== "EXPERT").concat(vocabularyBank.slice(0, 8))
      : vocabularyBank;
  return shuffle(source).slice(0, count).map(({ level: _level, ...entry }) => entry);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

const vocabularyBank: (VocabularyEntry & { level: PracticeDifficulty })[] = [
  { word: "ephemeral", meaning: "lasting for a very short time", example: "The rainbow was ephemeral after the rain stopped.", level: "HARD" },
  { word: "meticulous", meaning: "extremely careful and precise", example: "She made a meticulous review of every line.", level: "HARD" },
  { word: "ambiguous", meaning: "open to more than one meaning", example: "The instruction was ambiguous until we saw an example.", level: "HARD" },
  { word: "resilient", meaning: "able to recover quickly", example: "A resilient system keeps working after small failures.", level: "MEDIUM" },
  { word: "eloquent", meaning: "fluent and persuasive in expression", example: "His eloquent speech held the room's attention.", level: "HARD" },
  { word: "pragmatic", meaning: "practical and realistic", example: "The team chose a pragmatic fix before launch.", level: "HARD" },
  { word: "lucid", meaning: "clear and easy to understand", example: "Her lucid explanation made the topic simple.", level: "MEDIUM" },
  { word: "tenacious", meaning: "persistent and determined", example: "The tenacious player kept improving each week.", level: "HARD" },
  { word: "candid", meaning: "honest and direct", example: "He gave candid feedback after the demo.", level: "MEDIUM" },
  { word: "nuance", meaning: "a subtle difference in meaning", example: "Good writing often depends on nuance.", level: "HARD" },
  { word: "obscure", meaning: "not clearly known or understood", example: "The bug came from an obscure edge case.", level: "MEDIUM" },
  { word: "diligent", meaning: "showing steady careful effort", example: "Diligent practice made her typing smoother.", level: "MEDIUM" },
  { word: "concise", meaning: "short but complete", example: "A concise answer saves everyone time.", level: "MEDIUM" },
  { word: "vivid", meaning: "clear, bright, or powerful", example: "The story created a vivid picture in her mind.", level: "EASY" },
  { word: "arduous", meaning: "very difficult and tiring", example: "The climb was arduous but rewarding.", level: "HARD" },
  { word: "benevolent", meaning: "kind and well meaning", example: "The benevolent mentor helped quietly.", level: "HARD" },
  { word: "cogent", meaning: "clear, logical, and convincing", example: "Her cogent argument changed the decision.", level: "EXPERT" },
  { word: "detrimental", meaning: "likely to cause harm", example: "Skipping sleep is detrimental to focus.", level: "HARD" },
  { word: "fastidious", meaning: "very attentive to detail", example: "The fastidious editor noticed every typo.", level: "EXPERT" },
  { word: "gregarious", meaning: "sociable and outgoing", example: "The gregarious host welcomed every guest.", level: "HARD" },
  { word: "innovative", meaning: "using new ideas or methods", example: "The team built an innovative practice tool.", level: "HARD" },
  { word: "juxtapose", meaning: "to place side by side for contrast", example: "The essay juxtaposed hope and fear.", level: "EXPERT" },
  { word: "kinetic", meaning: "related to motion", example: "The interface had a kinetic feeling.", level: "HARD" },
  { word: "logical", meaning: "reasonable and well ordered", example: "A logical plan is easier to follow.", level: "MEDIUM" },
  { word: "magnanimous", meaning: "generous toward others", example: "The winner was magnanimous in victory.", level: "EXPERT" },
  { word: "nostalgia", meaning: "longing for the past", example: "The old song filled her with nostalgia.", level: "MEDIUM" },
  { word: "obfuscate", meaning: "to make something unclear", example: "Complex names can obfuscate simple logic.", level: "EXPERT" },
  { word: "paradox", meaning: "a statement that seems contradictory but may be true", example: "Less haste, more speed is a paradox.", level: "HARD" },
  { word: "practical", meaning: "useful and realistic", example: "A practical habit is easier to repeat.", level: "MEDIUM" },
  { word: "rhetoric", meaning: "the art of persuasive language", example: "The speech used powerful rhetoric.", level: "HARD" },
  { word: "serendipity", meaning: "a lucky unexpected discovery", example: "Finding the note was pure serendipity.", level: "EXPERT" },
  { word: "thoughtful", meaning: "showing careful consideration", example: "Her thoughtful reply solved the confusion.", level: "MEDIUM" },
  { word: "ubiquitous", meaning: "found everywhere", example: "Smartphones are ubiquitous today.", level: "EXPERT" },
  { word: "verbose", meaning: "using more words than needed", example: "The verbose message hid the main point.", level: "HARD" },
  { word: "worthwhile", meaning: "useful enough to deserve time", example: "Daily practice became worthwhile quickly.", level: "MEDIUM" },
  { word: "zealous", meaning: "full of eager enthusiasm", example: "The zealous beginner practiced every day.", level: "HARD" }
];

const codeSnippets: Record<CodeLanguage, string[]> = {
  CPP: [
    "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    vector<int> nums = {4, 1, 7, 3, 9};\n    sort(nums.begin(), nums.end());\n    for (int value : nums) cout << value << ' ';\n    return 0;\n}",
    "long long fastPower(long long base, long long exp, long long mod) {\n    long long ans = 1;\n    while (exp > 0) {\n        if (exp & 1) ans = ans * base % mod;\n        base = base * base % mod;\n        exp >>= 1;\n    }\n    return ans;\n}",
    "int binarySearch(const vector<int>& a, int target) {\n    int left = 0, right = (int)a.size() - 1;\n    while (left <= right) {\n        int mid = left + (right - left) / 2;\n        if (a[mid] == target) return mid;\n        if (a[mid] < target) left = mid + 1;\n        else right = mid - 1;\n    }\n    return -1;\n}",
    "vector<int> prefixSum(const vector<int>& nums) {\n    vector<int> pref(nums.size() + 1, 0);\n    for (int i = 0; i < (int)nums.size(); ++i) {\n        pref[i + 1] = pref[i] + nums[i];\n    }\n    return pref;\n}"
  ],
  JAVASCRIPT: [
    "function groupByUser(events) {\n  return events.reduce((map, event) => {\n    const list = map.get(event.userId) ?? [];\n    list.push(event);\n    map.set(event.userId, list);\n    return map;\n  }, new Map());\n}",
    "const scores = players\n  .filter((player) => player.finishedAt)\n  .sort((a, b) => b.wpm - a.wpm)\n  .map((player, index) => ({ ...player, rank: index + 1 }));",
    "async function loadProfile(id) {\n  const response = await fetch(`/api/profile/${id}`);\n  if (!response.ok) throw new Error('Profile failed');\n  return response.json();\n}"
  ],
  PYTHON: [
    "def binary_search(values, target):\n    left, right = 0, len(values) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if values[mid] == target:\n            return mid\n        if values[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1",
    "from collections import Counter\n\nwords = ['fast', 'clean', 'fast', 'steady']\ncounts = Counter(words)\nfor word, total in counts.items():\n    print(word, total)",
    "def moving_average(values, size):\n    result = []\n    for index in range(len(values)):\n        window = values[max(0, index - size + 1):index + 1]\n        result.append(sum(window) / len(window))\n    return result"
  ],
  JAVA: [
    "public class Main {\n    public static void main(String[] args) {\n        int[] values = {4, 1, 9, 2};\n        Arrays.sort(values);\n        for (int value : values) {\n            System.out.println(value);\n        }\n    }\n}",
    "static int gcd(int a, int b) {\n    while (b != 0) {\n        int r = a % b;\n        a = b;\n        b = r;\n    }\n    return a;\n}",
    "Map<String, Integer> counts = new HashMap<>();\nfor (String word : words) {\n    counts.put(word, counts.getOrDefault(word, 0) + 1);\n}"
  ],
  SQL: [
    "SELECT u.username, COUNT(p.id) AS races_done, MAX(p.wpm) AS best_wpm\nFROM \"User\" u\nLEFT JOIN \"Participant\" p ON p.\"userId\" = u.id\nGROUP BY u.id, u.username\nORDER BY best_wpm DESC NULLS LAST;",
    "WITH recent AS (\n    SELECT \"userId\", wpm, accuracy, \"createdAt\"\n    FROM \"PracticeSession\"\n    WHERE \"createdAt\" >= NOW() - INTERVAL '30 days'\n)\nSELECT \"userId\", AVG(wpm) AS avg_wpm\nFROM recent\nGROUP BY \"userId\";",
    "INSERT INTO \"Achievement\" (id, \"userId\", code, title, description, category)\nVALUES ($1, $2, 'FIRST_TEST', 'First Test', 'Completed one test.', 'Practice')\nON CONFLICT (\"userId\", code) DO NOTHING;"
  ]
};

const dailyChallengePrompts = [
  "Daily improvement is built from small honest repetitions. Focus on calm accuracy first, then let speed arrive from rhythm and trust.",
  "A useful system should reward patience as much as speed. The best typists notice patterns, recover quickly, and keep their hands relaxed.",
  "Every test is a compact record of attention. Clean inputs, steady timing, and fewer corrections reveal more than a single fast burst.",
  "Practice becomes meaningful when it measures progress clearly. A strong result combines speed, accuracy, consistency, and control under pressure.",
  "The leaderboard changes every day, but the useful habit stays the same. Type the next word clearly and let the score follow the work.",
  "Skill grows when feedback is specific. Slow down around difficult letters, keep moving through easy words, and finish with fewer avoidable errors."
];

const achievementCatalog: {
  code: string;
  title: string;
  description: string;
  category: string;
  isUnlocked: (stats: {
    source: "practice" | "daily";
    wpm: number;
    accuracy: number;
    consistency: number;
    score: number;
    errors: number;
    practiceCount: number;
    dailyCount: number;
  }) => boolean;
}[] = [
  {
    code: "FIRST_TEST",
    title: "First Test",
    description: "Completed your first practice session.",
    category: "Practice",
    isUnlocked: ({ practiceCount }) => practiceCount >= 1
  },
  {
    code: "ACCURACY_95",
    title: "Precision Line",
    description: "Finished a test with at least 95% accuracy.",
    category: "Accuracy",
    isUnlocked: ({ accuracy }) => accuracy >= 95
  },
  {
    code: "NO_ERRORS",
    title: "Clean Sheet",
    description: "Finished a test without any typing errors.",
    category: "Accuracy",
    isUnlocked: ({ errors }) => errors === 0
  },
  {
    code: "WPM_50",
    title: "Fast Hands",
    description: "Reached 50 WPM in a completed test.",
    category: "Speed",
    isUnlocked: ({ wpm }) => wpm >= 50
  },
  {
    code: "WPM_75",
    title: "Velocity Shift",
    description: "Reached 75 WPM in a completed test.",
    category: "Speed",
    isUnlocked: ({ wpm }) => wpm >= 75
  },
  {
    code: "CONSISTENCY_90",
    title: "Steady Rhythm",
    description: "Finished with at least 90% consistency.",
    category: "Control",
    isUnlocked: ({ consistency }) => consistency >= 90
  },
  {
    code: "SCORE_1000",
    title: "Four Digit Run",
    description: "Scored 1000 or more in one test.",
    category: "Score",
    isUnlocked: ({ score }) => score >= 1000
  },
  {
    code: "TEN_TESTS",
    title: "Habit Builder",
    description: "Completed 10 practice sessions.",
    category: "Practice",
    isUnlocked: ({ practiceCount }) => practiceCount >= 10
  },
  {
    code: "FIRST_DAILY",
    title: "Daily Debut",
    description: "Completed your first daily challenge.",
    category: "Daily",
    isUnlocked: ({ dailyCount }) => dailyCount >= 1
  },
  {
    code: "DAILY_CLEAN",
    title: "Daily Clear",
    description: "Completed a daily challenge with no errors.",
    category: "Daily",
    isUnlocked: ({ source, errors }) => source === "daily" && errors === 0
  }
];

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
