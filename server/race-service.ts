import { nanoid } from "nanoid";
import { TextMode } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { analyzeCheat, calculateAccuracy, calculateConsistency, calculateWpm, eloDelta } from "../lib/race-math";
import type { ClientUser, CodeLanguage, KeystrokePayload, PracticeDifficulty, PracticeMode, PublicRoomSummary, RacePlayer, RaceSnapshot } from "../lib/types";

const PRIVATE_ROOM_CAPACITY = 10;
const PUBLIC_ROOM_CAPACITY = 50;

type LiveRoom = {
  code: string;
  roomId: string;
  raceId: string;
  prompt: string;
  isPrivate: boolean;
  isDuel: boolean;
  capacity: number;
  textMode: TextMode;
  raceMode: PracticeMode;
  codeLanguage: CodeLanguage;
  difficulty: PracticeDifficulty;
  durationSeconds: number;
  status: RaceSnapshot["status"];
  startsAt?: number;
  endsAt?: number;
  players: Map<string, RacePlayer>;
  events: Map<string, KeystrokePayload[]>;
  spectators: Set<string>;
  invitedUserIds?: Set<string>;
};

const prompts = [
  {
    mode: TextMode.PROSE,
    body: "Every fast system begins as a careful conversation between latency, trust, and the small promises that services make to each other."
  },
  {
    mode: TextMode.PROSE,
    body: "The best racers do not fight the keyboard. They listen for rhythm, recover quickly, and keep their eyes a few words ahead."
  },
  {
    mode: TextMode.CODE,
    body: "function scoreRace(chars: number, ms: number) {\n  return Math.round((chars / 5) / (ms / 60000));\n}"
  }
];

type MatchmakingEntry = {
  user: ClientUser;
  textMode: TextMode;
  raceMode: PracticeMode;
  codeLanguage: CodeLanguage;
  difficulty: PracticeDifficulty;
  durationSeconds: number;
};

const raceCodePrompts: Record<CodeLanguage, string[]> = {
  CPP: [
    "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    vector<int> values = {8, 3, 5, 1};\n    sort(values.begin(), values.end());\n    for (int value : values) cout << value << ' ';\n    return 0;\n}"
  ],
  JAVASCRIPT: [
    "function calculateWpm(chars, elapsedMs) {\n  const words = chars / 5;\n  const minutes = elapsedMs / 60000;\n  return Math.round(words / Math.max(minutes, 0.01));\n}"
  ],
  PYTHON: [
    "def calculate_wpm(chars, elapsed_ms):\n    words = chars / 5\n    minutes = elapsed_ms / 60000\n    return round(words / max(minutes, 0.01))"
  ],
  JAVA: [
    "public static int calculateWpm(int chars, long elapsedMs) {\n    double words = chars / 5.0;\n    double minutes = elapsedMs / 60000.0;\n    return (int) Math.round(words / Math.max(minutes, 0.01));\n}"
  ],
  SQL: [
    "SELECT username, rating, \"createdAt\"\nFROM \"User\"\nWHERE rating >= 0\nORDER BY rating DESC, username ASC\nLIMIT 20;"
  ]
};

export class RaceService {
  private rooms = new Map<string, LiveRoom>();
  private matchmaking: MatchmakingEntry[] = [];
  private challengeReservations = new Set<string>();

  updateUsername(userId: string, username: string) {
    for (const entry of this.matchmaking) if (entry.user.id === userId) entry.user.username = username;
    const snapshots: RaceSnapshot[] = [];
    for (const room of this.rooms.values()) {
      const player = room.players.get(userId);
      if (player) { player.username = username; snapshots.push(this.snapshot(room)); }
    }
    return snapshots;
  }

  isUserBusy(userId: string) {
    return this.matchmaking.some((entry) => entry.user.id === userId) ||
      [...this.rooms.values()].some((room) => room.players.has(userId) &&
        ["WAITING", "COUNTDOWN", "LIVE"].includes(room.status));
  }

  async createFriendDuel(users: ClientUser[]) {
    if (users.some((user) => this.isUserBusy(user.id) || this.challengeReservations.has(user.id))) throw new Error("A player is already joining a race.");
    users.forEach((user) => this.challengeReservations.add(user.id));
    try {
      return await this.createDuel(users, {
        user: users[0], textMode: TextMode.PROSE, raceMode: "WORDS",
        codeLanguage: "CPP", difficulty: "MEDIUM", durationSeconds: 60
      });
    } finally { users.forEach((user) => this.challengeReservations.delete(user.id)); }
  }

  async createRoom(
    owner: ClientUser,
    isPrivate = true,
    textMode: TextMode = TextMode.PROSE,
    customText?: string,
    codeLanguage: CodeLanguage = "CPP",
    difficulty: PracticeDifficulty = "MEDIUM",
    durationSeconds = 120,
    raceMode: PracticeMode = practiceModeFromTextMode(textMode)
  ) {
    if (this.challengeReservations.has(owner.id)) throw new Error("Your friend duel is being prepared.");
    const code = nanoid(6).toUpperCase();
    const safeDuration = normalizeRaceDuration(durationSeconds);
    const safeDifficulty = normalizeDifficulty(difficulty);
    const safeRaceMode = normalizePracticeMode(raceMode);
    const safeTextMode = textModeFromPracticeMode(safeRaceMode, textMode);
    const prompt = customText?.trim() || await this.pickPrompt(safeRaceMode, codeLanguage, safeDifficulty, safeDuration);
    const room = await prisma.room.create({
      data: { code, ownerId: owner.id, isPrivate, textMode: safeTextMode, raceMode: safeRaceMode, customText, codeLanguage, difficulty: safeDifficulty, durationSeconds: safeDuration }
    });
    const race = await prisma.race.create({
      data: { roomId: room.id, prompt, status: "WAITING" }
    });
    const live = this.createLiveRoom(code, room.id, race.id, prompt, isPrivate, false, isPrivate ? PRIVATE_ROOM_CAPACITY : PUBLIC_ROOM_CAPACITY, safeTextMode, safeRaceMode, codeLanguage, safeDifficulty, safeDuration);
    await this.addPlayer(live, owner);
    return this.snapshot(live);
  }

  async joinRoom(code: string, user: ClientUser, spectator = false) {
    if (this.challengeReservations.has(user.id)) throw new Error("Your friend duel is being prepared.");
    const normalized = code.trim().toUpperCase();
    let live = this.rooms.get(normalized);
    if (!live) {
      const room = await prisma.room.findUnique({
        where: { code: normalized },
        include: { races: { orderBy: { createdAt: "desc" }, take: 1 } }
      });
      if (!room || !room.races[0]) throw new Error("Room not found.");
      live = this.createLiveRoom(
        room.code,
        room.id,
        room.races[0].id,
        room.races[0].prompt,
        room.isPrivate,
        false,
        room.isPrivate ? PRIVATE_ROOM_CAPACITY : PUBLIC_ROOM_CAPACITY,
        room.textMode,
        normalizePracticeMode(room.raceMode),
        normalizeCodeLanguage(room.codeLanguage),
        normalizeDifficulty(room.difficulty),
        normalizeRaceDuration(room.durationSeconds)
      );
    }
    if (spectator) {
      if (live.isDuel) throw new Error("Quick duels are private between two matched racers.");
      live.spectators.add(user.id);
    } else {
      if (live.invitedUserIds && !live.invitedUserIds.has(user.id)) throw new Error("This duel is reserved for its invited players.");
      if (live.players.has(user.id)) return this.snapshot(live);
      if (live.status !== "WAITING") throw new Error("This race has already started.");
      await this.addPlayer(live, user);
    }
    return this.snapshot(live);
  }

  leaveRoom(code: string, userId: string) {
    const live = this.getLive(code);
    const wasPlayer = live.players.delete(userId);
    live.events.delete(userId);
    live.spectators.delete(userId);
    if (live.players.size === 0 && (live.status === "WAITING" || live.status === "COUNTDOWN")) {
      live.status = "CANCELLED";
      void prisma.race.update({ where: { id: live.raceId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return { wasPlayer, snapshot: this.snapshot(live) };
  }

  removeUserFromAllRooms(userId: string) {
    for (const live of this.rooms.values()) {
      live.players.delete(userId);
      live.events.delete(userId);
      live.spectators.delete(userId);
      if (live.players.size === 0 && (live.status === "WAITING" || live.status === "COUNTDOWN")) {
        live.status = "CANCELLED";
        void prisma.race.update({ where: { id: live.raceId }, data: { status: "CANCELLED" } }).catch(() => undefined);
      }
    }
    this.leaveMatchmaking(userId);
  }

  publicRooms(): PublicRoomSummary[] {
    return Array.from(this.rooms.values())
      .filter((room) => !room.isPrivate && room.status === "WAITING")
      .map((room) => ({
        roomCode: room.code,
        raceMode: room.raceMode,
        difficulty: room.difficulty,
        durationSeconds: room.durationSeconds,
        codeLanguage: room.codeLanguage,
        players: room.players.size,
        capacity: PUBLIC_ROOM_CAPACITY,
        spectators: room.spectators.size,
        status: room.status
      }))
      .sort((a, b) => b.players - a.players || a.roomCode.localeCompare(b.roomCode));
  }

  async enterMatchmaking(
    user: ClientUser,
    options: Partial<{ textMode: TextMode; raceMode: PracticeMode; codeLanguage: CodeLanguage; difficulty: PracticeDifficulty; durationSeconds: number }> = {}
  ) {
    if (this.challengeReservations.has(user.id)) throw new Error("Your friend duel is being prepared.");
    const raceMode = normalizePracticeMode(options.raceMode ?? practiceModeFromTextMode(options.textMode ?? TextMode.PROSE));
    const entry: MatchmakingEntry = {
      user,
      textMode: textModeFromPracticeMode(raceMode, options.textMode),
      raceMode,
      codeLanguage: options.codeLanguage ?? "CPP",
      difficulty: normalizeDifficulty(options.difficulty),
      durationSeconds: normalizeRaceDuration(options.durationSeconds)
    };
    if (!this.matchmaking.find((queued) => queued.user.id === user.id)) {
      this.matchmaking.push(entry);
    }
    const sorted = [...this.matchmaking].sort((a, b) => a.user.rating - b.user.rating);
    const match = sorted.find((candidate) => {
      if (candidate.user.id === user.id) return false;
      return candidate.textMode === entry.textMode
        && candidate.raceMode === entry.raceMode
        && candidate.codeLanguage === entry.codeLanguage
        && candidate.difficulty === entry.difficulty
        && candidate.durationSeconds === entry.durationSeconds
        && Math.abs(candidate.user.rating - user.rating) <= 220;
    });
    if (!match) return null;

    this.matchmaking = this.matchmaking.filter((queued) => queued.user.id !== user.id && queued.user.id !== match.user.id);
    const snapshot = await this.createDuel([user, match.user], entry);
    return snapshot;
  }

  leaveMatchmaking(userId: string) {
    this.matchmaking = this.matchmaking.filter((entry) => entry.user.id !== userId);
  }

  startCountdown(code: string, user: ClientUser) {
    const live = this.getLive(code);
    if (live.status !== "WAITING") return this.snapshot(live);
    const player = live.players.get(user.id);
    if (!player) throw new Error("Join the room before starting.");
    player.ready = true;
    if (live.players.size < 2) {
      return this.snapshot(live);
    }
    if (!Array.from(live.players.values()).every((value) => value.ready)) {
      return this.snapshot(live);
    }
    live.status = "COUNTDOWN";
    live.startsAt = Date.now() + 5000;
    live.endsAt = live.startsAt + live.durationSeconds * 1000;
    void prisma.race.update({ where: { id: live.raceId }, data: { status: "COUNTDOWN", countdownAt: new Date() } }).catch(() => undefined);
    setTimeout(() => {
      if (live.status === "COUNTDOWN") {
        live.status = "LIVE";
        void prisma.race.update({ where: { id: live.raceId }, data: { status: "LIVE", startedAt: new Date() } }).catch(() => undefined);
      }
    }, 5000);
    return this.snapshot(live);
  }

  recordKeystroke(code: string, user: ClientUser, payload: KeystrokePayload) {
    const live = this.getLive(code);
    const player = live.players.get(user.id);
    if (!player || live.status !== "LIVE") return this.snapshot(live);
    if (live.endsAt && Date.now() >= live.endsAt) {
      void this.finishByTimeout(code);
      return this.snapshot(live);
    }

    const events = live.events.get(user.id) ?? [];
    events.push(payload);
    live.events.set(user.id, events);

    const errors = events.filter((event) => !event.correct).length;
    const correctChars = payload.typed.split("").filter((char, index) => char === live.prompt[index]).length;
    const progress = Math.min(100, Math.round((payload.typed.length / live.prompt.length) * 100));
    const cheat = analyzeCheat(events, live.prompt.length);

    player.progress = progress;
    player.errors = errors;
    player.wpm = Math.round(calculateWpm(correctChars, payload.elapsedMs));
    player.accuracy = Math.round(calculateAccuracy(events.length, errors) * 10) / 10;
    player.consistency = Math.round(calculateConsistency(events));
    player.cheatScore = cheat.score;
    player.cheatFlags = cheat.flags;

    void this.persistKeystroke(live.raceId, user.id, payload);

    if (payload.typed === live.prompt && !player.finishedAt) {
      player.finishedAt = new Date().toISOString();
      player.placement = Array.from(live.players.values()).filter((value) => value.finishedAt).length;
      void this.finishParticipant(live, user.id, player);
    }

    if (Array.from(live.players.values()).every((value) => value.finishedAt)) {
      live.status = "FINISHED";
      void this.finishRace(live);
    }

    return this.snapshot(live);
  }

  snapshotByCode(code: string) {
    return this.snapshot(this.getLive(code));
  }

  async finishByTimeout(code: string) {
    const live = this.getLive(code);
    if (live.status !== "LIVE") return this.snapshot(live);
    live.status = "FINISHED";
    const finishedCount = Array.from(live.players.values()).filter((value) => value.finishedAt).length;
    const unfinished = Array.from(live.players.values())
      .filter((value) => !value.finishedAt)
      .sort((a, b) => b.progress - a.progress || b.wpm - a.wpm || a.errors - b.errors);
    for (const [index, player] of unfinished.entries()) {
      player.finishedAt = new Date().toISOString();
      player.placement = finishedCount + index + 1;
      await this.finishParticipant(live, player.userId, player);
    }
    await this.finishRace(live);
    return this.snapshot(live);
  }

  async ghostReplay(raceId: string, userId: string) {
    const events = await prisma.keystrokeEvent.findMany({
      where: { raceId, userId },
      orderBy: { elapsedMs: "asc" }
    });
    return events.map((event) => ({
      index: event.index,
      key: event.key,
      expected: event.expected,
      correct: event.correct,
      elapsedMs: event.elapsedMs,
      intervalMs: event.intervalMs
    }));
  }

  private async createDuel(users: ClientUser[], options: MatchmakingEntry) {
    const code = nanoid(6).toUpperCase();
    const prompt = await this.pickPrompt(options.raceMode, options.codeLanguage, options.difficulty, options.durationSeconds);
    const room = await prisma.room.create({
      data: {
        code,
        isPrivate: true,
        textMode: options.textMode,
        raceMode: options.raceMode,
        codeLanguage: options.codeLanguage,
        difficulty: options.difficulty,
        durationSeconds: options.durationSeconds
      }
    });
    const race = await prisma.race.create({ data: { roomId: room.id, prompt, status: "WAITING" } });
    const live = this.createLiveRoom(code, room.id, race.id, prompt, true, true, 2, options.textMode, options.raceMode, options.codeLanguage, options.difficulty, options.durationSeconds);
    live.invitedUserIds = new Set(users.map((user) => user.id));
    for (const user of users) await this.addPlayer(live, user);
    return this.snapshot(live);
  }

  private createLiveRoom(
    code: string,
    roomId: string,
    raceId: string,
    prompt: string,
    isPrivate: boolean,
    isDuel: boolean,
    capacity: number,
    textMode: TextMode,
    raceMode: PracticeMode,
    codeLanguage: CodeLanguage,
    difficulty: PracticeDifficulty,
    durationSeconds: number
  ) {
    const live: LiveRoom = {
      code,
      roomId,
      raceId,
      prompt,
      isPrivate,
      isDuel,
      capacity,
      textMode,
      raceMode,
      codeLanguage,
      difficulty,
      durationSeconds,
      status: "WAITING",
      players: new Map(),
      events: new Map(),
      spectators: new Set()
    };
    this.rooms.set(code, live);
    return live;
  }

  private async addPlayer(live: LiveRoom, user: ClientUser) {
    if (live.players.has(user.id)) return;
    if (live.players.size >= live.capacity) {
      throw new Error(`${live.isDuel ? "Quick duel" : live.isPrivate ? "Private" : "Public"} room is full.`);
    }
    live.players.set(user.id, {
      userId: user.id,
      username: user.username,
      rating: user.rating,
      ready: false,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      errors: 0,
      consistency: 100,
      cheatScore: 0,
      cheatFlags: []
    });
    live.events.set(user.id, []);
    await prisma.participant.upsert({
      where: { raceId_userId: { raceId: live.raceId, userId: user.id } },
      update: { isSpectator: false },
      create: { raceId: live.raceId, userId: user.id, ratingBefore: user.rating }
    });
  }

  private snapshot(live: LiveRoom): RaceSnapshot {
    return {
      roomCode: live.code,
      raceId: live.raceId,
      prompt: live.prompt,
      isPrivate: live.isPrivate,
      isDuel: live.isDuel,
      status: live.status,
      startsAt: live.startsAt,
      endsAt: live.endsAt,
      countdownSeconds: live.startsAt ? Math.max(0, Math.ceil((live.startsAt - Date.now()) / 1000)) : 0,
      textMode: live.textMode,
      raceMode: live.raceMode,
      difficulty: live.difficulty,
      durationSeconds: live.durationSeconds,
      codeLanguage: live.codeLanguage,
      readyUserIds: Array.from(live.players.values()).filter((player) => player.ready).map((player) => player.userId),
      players: Array.from(live.players.values()).sort((a, b) => b.progress - a.progress || (a.placement ?? 99) - (b.placement ?? 99)),
      spectators: live.spectators.size
    };
  }

  private getLive(code: string) {
    const live = this.rooms.get(code.trim().toUpperCase());
    if (!live) throw new Error("Room not found.");
    return live;
  }

  private async pickPrompt(mode: PracticeMode, codeLanguage: CodeLanguage = "CPP", difficulty: PracticeDifficulty = "MEDIUM", durationSeconds = 120) {
    const textMode = textModeFromPracticeMode(mode);
    const text = await prisma.raceText.findFirst({
      where: textMode === TextMode.CODE ? { mode: textMode, OR: [{ language: codeLanguage }, { language: null }] } : { mode: textMode },
      orderBy: { createdAt: "desc" }
    }).catch(() => null);
    if (text && (mode === "STORY" || mode === "QUOTE")) return expandPrompt(text.body, durationSeconds);
    if (mode === "CODE") return buildCodeRacePrompt(codeLanguage, durationSeconds);
    if (mode === "WORDS") return buildWordsRacePrompt(difficulty, durationSeconds);
    if (mode === "VOCAB") return buildVocabularyRacePrompt(difficulty, durationSeconds);
    if (mode === "ADAPTIVE") return buildAdaptiveRacePrompt(difficulty, durationSeconds);
    const fallback = prompts.filter((prompt) => prompt.mode === textMode).map((prompt) => prompt.body);
    return buildTextRacePrompt(fallback.length ? fallback : prompts.map((prompt) => prompt.body), difficulty, durationSeconds);
  }

  private async persistKeystroke(raceId: string, userId: string, payload: KeystrokePayload) {
    const participant = await prisma.participant.findUnique({ where: { raceId_userId: { raceId, userId } } });
    if (!participant) return;
    await prisma.keystrokeEvent.create({
      data: {
        raceId,
        participantId: participant.id,
        userId,
        index: payload.index,
        key: payload.key.slice(0, 12),
        expected: payload.expected,
        correct: payload.correct,
        elapsedMs: Math.round(payload.elapsedMs),
        intervalMs: Math.round(payload.intervalMs)
      }
    });
  }

  private async finishParticipant(live: LiveRoom, userId: string, player: RacePlayer) {
    await prisma.participant.update({
      where: { raceId_userId: { raceId: live.raceId, userId } },
      data: {
        progress: player.progress,
        wpm: player.wpm,
        accuracy: player.accuracy,
        errors: player.errors,
        consistency: player.consistency,
        cheatScore: player.cheatScore,
        cheatFlags: player.cheatFlags,
        placement: player.placement,
        finishedAt: new Date(player.finishedAt!)
      }
    });
    await this.updatePracticeStats(live, userId);
  }

  private async finishRace(live: LiveRoom) {
    const players = Array.from(live.players.values());
    for (const player of players) {
      const opponents = players.filter((opponent) => opponent.userId !== player.userId).map((opponent) => opponent.rating);
      const delta = eloDelta(player.rating, opponents, player.placement ?? players.length);
      const ratingAfter = Math.max(0, player.rating + delta);
      await prisma.user.update({ where: { id: player.userId }, data: { rating: ratingAfter } });
      await prisma.participant.update({
        where: { raceId_userId: { raceId: live.raceId, userId: player.userId } },
        data: { ratingAfter }
      });
      await prisma.ratingHistory.create({
        data: { userId: player.userId, raceId: live.raceId, rating: ratingAfter, delta }
      });
    }
    await prisma.race.update({ where: { id: live.raceId }, data: { status: "FINISHED", finishedAt: new Date() } });
  }

  private async updatePracticeStats(live: LiveRoom, userId: string) {
    const events = live.events.get(userId) ?? [];
    const wrong = events.filter((event) => !event.correct);
    for (const event of wrong) {
      await prisma.practiceStat.upsert({
        where: { userId_token_tokenType: { userId, token: event.expected, tokenType: "letter" } },
        update: { attempts: { increment: 1 }, mistakes: { increment: 1 } },
        create: { userId, token: event.expected, tokenType: "letter", attempts: 1, mistakes: 1 }
      });
    }
    for (const word of wordsWithMistakes(live.prompt, wrong.map((event) => event.index))) {
      await prisma.practiceStat.upsert({
        where: { userId_token_tokenType: { userId, token: word, tokenType: "word" } },
        update: { attempts: { increment: 1 }, mistakes: { increment: 1 } },
        create: { userId, token: word, tokenType: "word", attempts: 1, mistakes: 1 }
      });
    }
  }
}

function normalizeCodeLanguage(value: unknown): CodeLanguage {
  if (value === "JAVASCRIPT") return "JAVASCRIPT";
  if (value === "PYTHON") return "PYTHON";
  if (value === "JAVA") return "JAVA";
  if (value === "SQL") return "SQL";
  return "CPP";
}

function normalizePracticeMode(value: unknown): PracticeMode {
  if (value === "VOCAB") return "VOCAB";
  if (value === "QUOTE") return "QUOTE";
  if (value === "CODE") return "CODE";
  if (value === "WORDS") return "WORDS";
  if (value === "ADAPTIVE") return "ADAPTIVE";
  return "WORDS";
}

function normalizeDifficulty(value: unknown): PracticeDifficulty {
  if (value === "EASY") return "EASY";
  if (value === "HARD") return "HARD";
  if (value === "EXPERT") return "EXPERT";
  return "MEDIUM";
}

function textModeFromPracticeMode(mode: PracticeMode, fallback: TextMode = TextMode.PROSE) {
  if (mode === "CODE") return TextMode.CODE;
  if (mode === "QUOTE") return TextMode.QUOTE;
  if (mode === "STORY" || mode === "WORDS" || mode === "VOCAB" || mode === "ADAPTIVE") return TextMode.PROSE;
  return fallback;
}

function practiceModeFromTextMode(mode: TextMode): PracticeMode {
  if (mode === TextMode.CODE) return "CODE";
  if (mode === TextMode.QUOTE) return "QUOTE";
  return "WORDS";
}

function normalizeRaceDuration(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 120;
  return Math.min(900, Math.max(60, Math.round(seconds)));
}

function expandPrompt(base: string, durationSeconds: number) {
  const targetLength = Math.max(900, durationSeconds * 18);
  const parts: string[] = [];
  while (parts.join(" ").length < targetLength) {
    parts.push(base.trim());
  }
  return parts.join("\n\n");
}

function buildTextRacePrompt(seedPrompts: string[], difficulty: PracticeDifficulty, durationSeconds: number) {
  const banks: Record<PracticeDifficulty, string[]> = {
    EASY: [
      "The morning plan was simple: open the laptop, breathe once, and finish the next useful thing.",
      "A steady racer reads ahead, keeps the hands relaxed, and returns to rhythm after every mistake.",
      "Good practice turns small daily effort into speed that feels natural under pressure."
    ],
    MEDIUM: [
      "Reliable progress comes from focused rounds, honest feedback, and a willingness to repeat the basics until they feel automatic.",
      "The best typing sessions are not only fast; they are calm, accurate, and consistent from the first word to the last.",
      "Every room becomes more exciting when each player is ready, the countdown begins, and the race feels fair."
    ],
    HARD: [
      "Consistent performance depends on disciplined pacing, precise corrections, and the ability to recover before one mistake becomes a pattern.",
      "A strong competitor balances ambition with control, choosing smooth accuracy before chasing reckless bursts of speed.",
      "Clear systems reward preparation: fair matchmaking, stable timing, useful analytics, and prompts long enough to reveal real skill."
    ],
    EXPERT: [
      "Exceptional typing is a blend of accuracy, endurance, measured aggression, and the patience to preserve rhythm while pressure rises.",
      "Advanced practice exposes tiny habits: uneven spacing, rushed punctuation, late corrections, and the tendency to lose focus near the finish.",
      "A serious racer treats consistency as evidence, because one fast burst matters less than sustained control across a demanding passage."
    ]
  };
  const targetLength = Math.max(1200, durationSeconds * 20);
  const source = [...seedPrompts, ...banks[difficulty]];
  const parts: string[] = [];
  let cursor = 0;
  while (parts.join(" ").length < targetLength) {
    parts.push(source[cursor % source.length]);
    cursor += 1;
  }
  return parts.join(" ");
}

function buildWordsRacePrompt(difficulty: PracticeDifficulty, durationSeconds: number) {
  const words = wordsForDifficulty(difficulty);
  const count = Math.max(520, Math.ceil(durationSeconds * 4.8));
  return Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
}

function buildVocabularyRacePrompt(difficulty: PracticeDifficulty, durationSeconds: number) {
  const examples = vocabularyExamplesForDifficulty(difficulty);
  const targetLength = Math.max(1500, durationSeconds * 22);
  const parts: string[] = [];
  let cursor = Math.floor(Math.random() * examples.length);
  while (parts.join(" ").length < targetLength) {
    parts.push(examples[cursor % examples.length]);
    cursor += 1;
  }
  return parts.join(" ");
}

function buildAdaptiveRacePrompt(difficulty: PracticeDifficulty, durationSeconds: number) {
  const warmup = [
    "steady focus makes difficult letters less surprising",
    "clean rhythm rewards patient correction and relaxed hands",
    "accuracy first then speed follows with better control"
  ];
  return buildTextRacePrompt(warmup, difficulty, durationSeconds);
}

function buildCodeRacePrompt(codeLanguage: CodeLanguage, durationSeconds: number) {
  const snippets = raceCodePrompts[codeLanguage];
  const targetLength = Math.max(1100, durationSeconds * 16);
  const parts: string[] = [];
  let cursor = 0;
  while (parts.join("\n\n").length < targetLength) {
    parts.push(snippets[cursor % snippets.length]);
    cursor += 1;
  }
  return parts.join("\n\n");
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
    "ability", "accept", "across", "action", "active", "actual", "adapt", "almost", "appear", "arrive", "balance", "become", "between",
    "beyond", "branch", "broken", "budget", "career", "center", "client", "column", "control", "custom", "decide", "degree", "design",
    "detail", "direct", "double", "engine", "enough", "entire", "escape", "event", "example", "expect", "factor", "figure", "filter",
    "finger", "global", "growth", "honest", "impact", "keyboard", "language", "logic", "object", "output", "packet", "parent", "policy",
    "practice", "private", "process", "program", "public", "question", "reduce", "search", "socket", "source", "toward", "wonder", "worker"
  ];
  const hardWords = [
    "abstract", "ambiguous", "analyze", "argument", "attribute", "brevity", "coherent", "complex", "context", "contrast", "criteria",
    "definite", "delegate", "density", "dynamic", "efficient", "elaborate", "emphasis", "evaluate", "evidence", "explicit", "fragment",
    "implicit", "inference", "integral", "interval", "junction", "luminous", "magnitude", "mechanism", "meticulous", "momentum",
    "notation", "objective", "parallel", "parameter", "perceive", "precise", "priority", "protocol", "rational", "sequence", "simulate",
    "strategy", "structure", "synthesis", "terminal", "validate", "velocity"
  ];
  const expertWords = [
    "access", "account", "actually", "address", "already", "although", "another", "because", "believe", "business", "calendar", "carefully",
    "challenge", "comfortable", "committee", "communication", "community", "complete", "condition", "connection", "consider", "continue",
    "different", "difficult", "direction", "education", "especially", "everything", "experience", "favorite", "February", "government",
    "guarantee", "important", "including", "information", "interesting", "necessary", "occasionally", "opportunity", "original",
    "particular", "personal", "possible", "probably", "professional", "receive", "remember", "restaurant", "schedule", "separate",
    "similar", "sincerely", "successful", "surprise", "temperature", "together", "tomorrow", "usually", "wednesday", "wonderful"
  ];
  if (difficulty === "EASY") return easyWords;
  if (difficulty === "HARD") return [...mediumWords, ...hardWords];
  if (difficulty === "EXPERT") return expertWords;
  return [...easyWords, ...mediumWords];
}

function vocabularyForDifficulty(difficulty: PracticeDifficulty) {
  const words = [
    "resilient", "lucid", "candid", "diligent", "concise", "vivid", "practical", "thoughtful", "worthwhile",
    "meticulous", "ambiguous", "eloquent", "pragmatic", "tenacious", "nuance", "obscure", "arduous", "benevolent",
    "cogent", "fastidious", "juxtapose", "magnanimous", "obfuscate", "serendipity", "ubiquitous", "verbose"
  ];
  if (difficulty === "EASY") return words.slice(0, 9);
  if (difficulty === "MEDIUM") return words.slice(0, 16);
  if (difficulty === "HARD") return words.slice(4, 22);
  return words;
}

function vocabularyExamplesForDifficulty(difficulty: PracticeDifficulty) {
  const examples = [
    { level: "EASY", text: "Her vivid notes made the idea clear during the meeting." },
    { level: "EASY", text: "A thoughtful reply can solve confusion before it grows." },
    { level: "EASY", text: "The practical plan helped everyone finish on time." },
    { level: "MEDIUM", text: "A resilient player recovers quickly after a difficult mistake." },
    { level: "MEDIUM", text: "His candid feedback made the design easier to improve." },
    { level: "MEDIUM", text: "A lucid explanation turns a complex topic into something useful." },
    { level: "MEDIUM", text: "Diligent practice makes clean typing feel more natural." },
    { level: "MEDIUM", text: "A concise summary is easier to remember under pressure." },
    { level: "HARD", text: "The meticulous engineer checked every detail before release." },
    { level: "HARD", text: "An ambiguous message can slow down an otherwise simple task." },
    { level: "HARD", text: "A pragmatic choice is sometimes better than a perfect theory." },
    { level: "HARD", text: "The tenacious student kept improving after every failed attempt." },
    { level: "HARD", text: "Small nuance can change the meaning of an entire sentence." },
    { level: "HARD", text: "Skipping sleep can be detrimental to focus and accuracy." },
    { level: "EXPERT", text: "Her cogent argument helped the team choose a better direction." },
    { level: "EXPERT", text: "A fastidious reviewer notices mistakes that others often miss." },
    { level: "EXPERT", text: "The essay juxtaposed ambition with patience in a memorable way." },
    { level: "EXPERT", text: "Verbose instructions can obfuscate a task that should feel simple." },
    { level: "EXPERT", text: "Finding the simple fix felt like serendipity after hours of debugging." },
    { level: "EXPERT", text: "Because phones are ubiquitous, mobile design deserves serious attention." }
  ] satisfies { level: PracticeDifficulty; text: string }[];
  const allowed = difficulty === "EASY"
    ? examples.filter((entry) => entry.level === "EASY" || entry.level === "MEDIUM")
    : difficulty === "MEDIUM"
      ? examples.filter((entry) => entry.level !== "EXPERT")
      : difficulty === "HARD"
        ? examples.filter((entry) => entry.level !== "EASY")
        : examples;
  return allowed.map((entry) => entry.text);
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
