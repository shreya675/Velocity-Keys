export type TextMode = "PROSE" | "CODE" | "QUOTE" | "CUSTOM";
export type PracticeMode = "STORY" | "QUOTE" | "CODE" | "WORDS" | "ADAPTIVE" | "VOCAB";
export type PracticeDifficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";
export type CodeLanguage = "CPP" | "JAVASCRIPT" | "PYTHON" | "JAVA" | "SQL";

export type VocabularyEntry = {
  word: string;
  meaning: string;
  example: string;
};

export type ClientUser = {
  id: string;
  email: string;
  username: string;
  rating: number;
};

export type RacePlayer = {
  userId: string;
  username: string;
  rating: number;
  ready: boolean;
  progress: number;
  wpm: number;
  accuracy: number;
  errors: number;
  consistency: number;
  cheatScore: number;
  cheatFlags: string[];
  finishedAt?: string;
  placement?: number;
};

export type RaceSnapshot = {
  roomCode: string;
  raceId: string;
  prompt: string;
  isPrivate: boolean;
  isDuel?: boolean;
  status: "WAITING" | "COUNTDOWN" | "LIVE" | "FINISHED" | "CANCELLED";
  startsAt?: number;
  endsAt?: number;
  countdownSeconds: number;
  textMode: TextMode;
  raceMode: PracticeMode;
  difficulty: PracticeDifficulty;
  durationSeconds: number;
  codeLanguage?: CodeLanguage;
  readyUserIds: string[];
  players: RacePlayer[];
  spectators: number;
};

export type PublicRoomSummary = {
  roomCode: string;
  raceMode: PracticeMode;
  difficulty: PracticeDifficulty;
  durationSeconds: number;
  codeLanguage?: CodeLanguage;
  players: number;
  capacity: number;
  spectators: number;
  status: RaceSnapshot["status"];
};

export type KeystrokePayload = {
  raceId: string;
  index: number;
  key: string;
  expected: string;
  correct: boolean;
  elapsedMs: number;
  intervalMs: number;
  typed: string;
};

export type AnalyticsSummary = {
  wpmTrend: { date: string; wpm: number }[];
  accuracyTrend: { date: string; accuracy: number }[];
  ratingHistory: { date: string; rating: number; delta: number }[];
  weakLetters: { token: string; mistakes: number; attempts: number }[];
  weakWords: { token: string; mistakes: number; attempts: number }[];
  consistency: number;
  recentRaces: {
    id: string;
    date: string;
    wpm: number;
    accuracy: number;
    placement?: number;
    cheatFlags: string[];
  }[];
};

export type LeaderboardUser = {
  id: string;
  username: string;
  rating: number;
  level: string;
  joinedAt: string;
  racesDone: number;
  practiceTestsDone: number;
  totalTypingSeconds: number;
  bestWpm: number;
  averageWpm: number;
  averageAccuracy: number;
  consistency: number;
  podiums: number;
  wins: number;
  achievements: AchievementBadge[];
};

export type AchievementBadge = {
  code: string;
  title: string;
  description: string;
  category: string;
  earnedAt: string;
};

export type LeaderboardSummary = {
  scope: "public" | "friends";
  users: LeaderboardUser[];
};

export type DailyChallengeEntry = {
  userId: string;
  username: string;
  rating: number;
  level: string;
  wpm: number;
  accuracy: number;
  consistency: number;
  score: number;
  errors: number;
  durationSeconds: number;
  completedAt: string;
};

export type DailyChallengeSummary = {
  id: string;
  challengeDate: string;
  prompt: string;
  durationSeconds: number;
  textMode: TextMode;
  leaderboard: DailyChallengeEntry[];
  myEntry?: DailyChallengeEntry;
};

export type FriendUser = {
  id: string;
  username: string;
  rating: number;
  level: string;
};

export type FriendPresence = "online" | "busy" | "offline";
export type RaceInvitation = {
  id: string;
  from: Pick<ClientUser, "id" | "username" | "rating">;
  to: Pick<ClientUser, "id" | "username" | "rating">;
  expiresAt: number;
};
export type FriendsLiveState = {
  presence: Record<string, FriendPresence>;
  invitations: RaceInvitation[];
};

export type FriendRequestSummary = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  respondedAt?: string;
  requester: FriendUser;
  addressee: FriendUser;
};

export type FriendsSummary = {
  friends: FriendUser[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
};

export type PracticeHistoryItem = {
  id: string;
  mode: PracticeMode;
  difficulty: PracticeDifficulty;
  codeLanguage?: CodeLanguage;
  durationSeconds: number;
  wpm: number;
  accuracy: number;
  consistency: number;
  score: number;
  createdAt: string;
};

export type PracticeResult = {
  wpm: number;
  accuracy: number;
  consistency: number;
  score: number;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  level: string;
  difficulty: PracticeDifficulty;
  vocabulary?: VocabularyEntry[];
};
