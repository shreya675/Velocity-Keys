import type { KeystrokePayload, PracticeDifficulty } from "./types";

export function calculateWpm(correctChars: number, elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  return Math.max(0, (correctChars / 5) / (elapsedMs / 60000));
}

export function calculateAccuracy(total: number, errors: number) {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, ((total - errors) / total) * 100));
}

export function calculateConsistency(events: KeystrokePayload[]) {
  if (events.length < 4) return 100;
  const intervals = events.map((event) => event.intervalMs).filter((value) => value > 0 && value < 3000);
  if (intervals.length < 4) return 100;
  const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance = intervals.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / intervals.length;
  const coefficient = Math.sqrt(variance) / Math.max(avg, 1);
  return Math.max(0, Math.min(100, 100 - coefficient * 45));
}

export function eloDelta(playerRating: number, opponentRatings: number[], placement: number) {
  if (opponentRatings.length === 0) return 0;
  const expected = opponentRatings.reduce((sum, rating) => {
    return sum + 1 / (1 + Math.pow(10, (rating - playerRating) / 400));
  }, 0) / opponentRatings.length;
  const actual = opponentRatings.length === 1 ? (placement === 1 ? 1 : 0) : 1 - (placement - 1) / opponentRatings.length;
  return Math.round(32 * (actual - expected));
}

export function practiceRatingDelta(input: { score: number; errors: number; accuracy: number; consistency: number; currentRating: number; difficulty?: PracticeDifficulty }) {
  const difficultyMultiplier = difficultyMultiplierFor(input.difficulty);
  const earned = input.score / 115;
  const qualityBonus = Math.max(0, input.accuracy - 92) * 0.16 + Math.max(0, input.consistency - 82) * 0.08;
  const errorPenalty = input.errors * errorPenaltyForRating(input.currentRating) * difficultyMultiplier * 0.36;
  const lowAccuracyPenalty = input.accuracy < 88 ? (88 - input.accuracy) * 0.3 : 0;
  const raw = earned + qualityBonus - errorPenalty - lowAccuracyPenalty;
  return Math.max(-35, Math.min(70, Math.round(raw)));
}

export function practiceScore(input: { wpm: number; accuracy: number; consistency: number; durationSeconds: number; errors?: number; currentRating?: number; difficulty?: PracticeDifficulty }) {
  const durationBonus = input.durationSeconds >= 120 ? 1.12 : input.durationSeconds >= 60 ? 1 : 0.86;
  const difficultyMultiplier = difficultyMultiplierFor(input.difficulty);
  const base = (input.wpm * 9 + input.accuracy * 5 + input.consistency * 3) * durationBonus * difficultyMultiplier;
  const penalty = (input.errors ?? 0) * errorPenaltyForRating(input.currentRating ?? 0) * difficultyMultiplier;
  return Math.max(0, Math.round(base - penalty));
}

export function difficultyMultiplierFor(difficulty: PracticeDifficulty = "MEDIUM") {
  if (difficulty === "EXPERT") return 1.3;
  if (difficulty === "HARD") return 1.15;
  if (difficulty === "EASY") return 0.85;
  return 1;
}

export function levelForRating(rating: number) {
  if (rating >= 3000) return "Apex";
  if (rating >= 2200) return "Vanguard";
  if (rating >= 1500) return "Surge";
  if (rating >= 1000) return "Pulse";
  if (rating >= 650) return "Stride";
  if (rating >= 300) return "Drift";
  if (rating >= 100) return "Spark";
  return "Seed";
}

function errorPenaltyForRating(rating: number) {
  if (rating >= 2200) return 18;
  if (rating >= 1500) return 15;
  if (rating >= 1000) return 12;
  if (rating >= 650) return 10;
  if (rating >= 300) return 8;
  if (rating >= 100) return 6;
  return 4;
}

export function analyzeCheat(events: KeystrokePayload[], promptLength: number) {
  const flags: string[] = [];
  if (events.length < 3) return { score: 0, flags };

  const intervals = events.map((event) => event.intervalMs).filter((value) => value >= 0);
  const tinyIntervals = intervals.filter((value) => value < 18).length;
  const pasteBursts = countConsecutive(intervals, (value) => value < 8, 5);
  const elapsedMs = Math.max(events[events.length - 1].elapsedMs, 1);
  const charsPerSecond = events.length / (elapsedMs / 1000);
  const perfectAtExtremeSpeed = charsPerSecond > 18 && events.every((event) => event.correct);
  const finishedTooFast = promptLength > 80 && elapsedMs < promptLength * 22;

  let score = 0;
  if (tinyIntervals / intervals.length > 0.25) {
    flags.push("machine-like intervals");
    score += 30;
  }
  if (pasteBursts > 0) {
    flags.push("paste-speed burst");
    score += 35;
  }
  if (perfectAtExtremeSpeed) {
    flags.push("perfect extreme speed");
    score += 25;
  }
  if (finishedTooFast) {
    flags.push("implausible completion time");
    score += 30;
  }

  return { score: Math.min(100, score), flags };
}

function countConsecutive(values: number[], predicate: (value: number) => boolean, threshold: number) {
  let run = 0;
  let matches = 0;
  for (const value of values) {
    run = predicate(value) ? run + 1 : 0;
    if (run === threshold) matches += 1;
  }
  return matches;
}
