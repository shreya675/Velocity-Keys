"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Activity, Award, BarChart3, BookOpen, Bot, Braces, CalendarDays, Check, Copy, Eye, Flag, Gauge, History, Keyboard, Link as LinkIcon, Lock, LogIn, Moon, Play, Plus, Quote, Radar, RefreshCcw, ShieldAlert, Sparkles, Square, Sun, Target, Timer, Trophy, UserPlus, Users, WholeWord, X } from "lucide-react";
import { calculateAccuracy, calculateConsistency, calculateWpm, levelForRating, practiceScore } from "@/lib/race-math";
import type { AnalyticsSummary, ClientUser, CodeLanguage, DailyChallengeSummary, FriendsSummary, KeystrokePayload, LeaderboardSummary, LeaderboardUser, PracticeDifficulty, PracticeHistoryItem, PracticeMode, PracticeResult, PublicRoomSummary, RaceSnapshot, TextMode, VocabularyEntry } from "@/lib/types";

type AuthMode = "login" | "register";
type ApiResult<T> = T & { error?: string };
type ActiveView = "practice" | "race" | "daily" | "friends" | "leaderboard" | "history" | "profile";
type Theme = "light" | "dark";
type LeaderboardScope = "public" | "friends";
type ToastTone = "info" | "success" | "error";
type ToastMessage = { id: number; message: string; tone: ToastTone };

export default function Home() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<ClientUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("practice");
  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [pendingInviteCode, setPendingInviteCode] = useState("");
  const [appOrigin, setAppOrigin] = useState("");
  const [customText, setCustomText] = useState("");
  const [textMode, setTextMode] = useState<TextMode>("PROSE");
  const [raceMode, setRaceMode] = useState<PracticeMode>("WORDS");
  const [roomVisibility, setRoomVisibility] = useState<"private" | "public">("private");
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>("CPP");
  const [raceDifficulty, setRaceDifficulty] = useState<PracticeDifficulty>("MEDIUM");
  const [raceDuration, setRaceDuration] = useState(120);
  const [typed, setTyped] = useState("");
  const [lastStrokeAt, setLastStrokeAt] = useState(0);
  const [raceStartedAt, setRaceStartedAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardSummary | null>(null);
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("public");
  const [profileUser, setProfileUser] = useState<LeaderboardUser | null>(null);
  const [friends, setFriends] = useState<FriendsSummary | null>(null);
  const [friendUsername, setFriendUsername] = useState("");
  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryItem[]>([]);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeSummary | null>(null);
  const [isDailyRunning, setIsDailyRunning] = useState(false);
  const [dailyStartedAt, setDailyStartedAt] = useState(0);
  const [dailyEvents, setDailyEvents] = useState<KeystrokePayload[]>([]);
  const [dailySaved, setDailySaved] = useState(false);
  const [practicePrompt, setPracticePrompt] = useState("");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("WORDS");
  const [practiceDifficulty, setPracticeDifficulty] = useState<PracticeDifficulty>("MEDIUM");
  const [practiceDuration, setPracticeDuration] = useState(60);
  const [isPracticeRunning, setIsPracticeRunning] = useState(false);
  const [practiceStartedAt, setPracticeStartedAt] = useState(0);
  const [practiceEvents, setPracticeEvents] = useState<KeystrokePayload[]>([]);
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [vocabularyEntries, setVocabularyEntries] = useState<VocabularyEntry[]>([]);
  const [practiceSaved, setPracticeSaved] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const raceStartedAtRef = useRef(0);
  const lastStrokeAtRef = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((items) => [...items.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("vk_token") ?? "";
    const savedUser = localStorage.getItem("vk_user");
    const savedTheme = localStorage.getItem("vk_theme");
    const inviteCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
    if (savedToken) setToken(savedToken);
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    setAppOrigin(process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin);
    if (inviteCode) {
      setPendingInviteCode(inviteCode);
      setRoomCode(inviteCode);
      setActiveView("race");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("vk_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    const nextSocket = io({ auth: { token } });
    nextSocket.on("race:snapshot", (nextSnapshot: RaceSnapshot) => {
      const nextRaceMode = nextSnapshot.raceMode ?? "WORDS";
      setRaceDifficulty(nextSnapshot.difficulty);
      setRaceDuration(nextSnapshot.durationSeconds);
      setRaceMode(nextRaceMode);
      setTextMode(textModeForPracticeMode(nextRaceMode));
      setSnapshot(nextSnapshot);
      if (nextSnapshot.status === "LIVE" && !raceStartedAtRef.current) {
        const now = nextSnapshot.startsAt ?? Date.now();
        raceStartedAtRef.current = now;
        setRaceStartedAt(now);
        inputRef.current?.focus();
      }
      if (nextSnapshot.status === "FINISHED") {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 1800);
      }
    });
    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const me = snapshot?.players.find((player) => player.userId === user?.id);
  const safeAnalytics = normalizeAnalytics(analytics);
  const target = activeView === "race" ? snapshot?.prompt ?? "" : activeView === "daily" ? dailyChallenge?.prompt ?? "" : practicePrompt;
  const finished = Boolean(snapshot && typed === snapshot.prompt);
  const countdown = snapshot?.startsAt ? Math.max(0, Math.ceil((snapshot.startsAt - clock) / 1000)) : snapshot?.countdownSeconds ?? 0;
  const raceRemaining = snapshot?.endsAt ? Math.max(0, Math.ceil((snapshot.endsAt - clock) / 1000)) : snapshot?.durationSeconds ?? raceDuration;
  const readyCount = snapshot?.readyUserIds.length ?? 0;
  const racerCount = snapshot?.players.length ?? 0;
  const amReady = Boolean(user && snapshot?.readyUserIds.includes(user.id));
  const raceSettingsLocked = Boolean(snapshot && snapshot.status !== "FINISHED");
  const practiceElapsedMs = isPracticeRunning ? Math.max(0, clock - practiceStartedAt) : practiceStartedAt ? Math.min(practiceDuration * 1000, clock - practiceStartedAt) : 0;
  const practiceRemaining = isPracticeRunning ? Math.max(0, practiceDuration - Math.floor(practiceElapsedMs / 1000)) : practiceDuration;
  const customTimerMinutes = Math.floor(practiceDuration / 60);
  const customTimerSeconds = practiceDuration % 60;
  const practiceMetrics = useMemo(() => {
    const elapsedMs = isPracticeRunning ? Math.max(practiceElapsedMs, 1) : Math.max(practiceEvents.at(-1)?.elapsedMs ?? practiceElapsedMs, 1);
    const errors = typed.split("").filter((char, index) => char !== target[index]).length;
    const correctChars = typed.split("").filter((char, index) => char === target[index]).length;
    const wpm = Math.round(calculateWpm(correctChars, elapsedMs));
    const accuracy = Math.round(calculateAccuracy(Math.max(typed.length, 1), errors) * 10) / 10;
    const consistency = Math.round(calculateConsistency(practiceEvents));
    const score = typed.length ? practiceScore({ wpm, accuracy, consistency, errors, durationSeconds: practiceDuration, currentRating: user?.rating ?? 0, difficulty: practiceDifficulty }) : 0;
    return { wpm, accuracy, consistency, score, errors };
  }, [isPracticeRunning, practiceDifficulty, practiceDuration, practiceElapsedMs, practiceEvents, target, typed, user?.rating]);
  const dailyDuration = dailyChallenge?.durationSeconds ?? 60;
  const dailyElapsedMs = isDailyRunning ? Math.max(0, clock - dailyStartedAt) : dailyStartedAt ? Math.min(dailyDuration * 1000, clock - dailyStartedAt) : 0;
  const dailyRemaining = isDailyRunning ? Math.max(0, dailyDuration - Math.floor(dailyElapsedMs / 1000)) : dailyDuration;
  const dailyMetrics = useMemo(() => {
    const elapsedMs = isDailyRunning ? Math.max(dailyElapsedMs, 1) : Math.max(dailyEvents.at(-1)?.elapsedMs ?? dailyElapsedMs, 1);
    const errors = typed.split("").filter((char, index) => char !== target[index]).length;
    const correctChars = typed.split("").filter((char, index) => char === target[index]).length;
    const wpm = Math.round(calculateWpm(correctChars, elapsedMs));
    const accuracy = Math.round(calculateAccuracy(Math.max(typed.length, 1), errors) * 10) / 10;
    const consistency = Math.round(calculateConsistency(dailyEvents));
    const score = typed.length ? practiceScore({ wpm, accuracy, consistency, errors, durationSeconds: dailyDuration, currentRating: user?.rating ?? 0, difficulty: "MEDIUM" }) : 0;
    return { wpm, accuracy, consistency, score, errors };
  }, [dailyDuration, dailyElapsedMs, dailyEvents, isDailyRunning, target, typed, user?.rating]);

  const submitAuth = async () => {
    setAuthError("");
    const path = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = authMode === "login" ? { email: authForm.email, password: authForm.password } : authForm;
    const result = await api<ApiResult<{ user: ClientUser; token: string }>>(path, { method: "POST", body: JSON.stringify(payload) });
    if (result.error) {
      setAuthError(result.error);
      showToast(result.error, "error");
      return;
    }
    setToken(result.token);
    setUser(result.user);
    localStorage.setItem("vk_token", result.token);
    localStorage.setItem("vk_user", JSON.stringify(result.user));
    showToast(authMode === "login" ? "Welcome back." : "Account created. Welcome to Velocity Keys.", "success");
  };

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    const result = await api<AnalyticsSummary>("/api/analytics", { headers: authHeaders });
    setAnalytics(normalizeAnalytics(result));
  }, [authHeaders, token]);

  useEffect(() => {
    if (!token) return;
    void api<ApiResult<{ user: ClientUser }>>("/api/me", { headers: authHeaders }).then((result) => {
      if (result.error || !result.user) {
        setToken("");
        setUser(null);
        localStorage.removeItem("vk_token");
        localStorage.removeItem("vk_user");
        return;
      }
      setUser(result.user);
      localStorage.setItem("vk_user", JSON.stringify(result.user));
    });
  }, [authHeaders, token]);

  const loadLeaderboard = useCallback(async (scope: LeaderboardScope = leaderboardScope) => {
    if (!token) return;
    const result = await api<ApiResult<LeaderboardSummary>>(`/api/leaderboard?scope=${scope}`, { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setLeaderboard(result);
  }, [authHeaders, leaderboardScope, token]);

  const loadProfile = useCallback(async (userId = "me") => {
    if (!token) return;
    const result = await api<ApiResult<{ user: LeaderboardUser }>>(`/api/profile/${userId}`, { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setProfileUser(result.user);
  }, [authHeaders, token]);

  const loadFriends = useCallback(async () => {
    if (!token) return;
    const result = await api<ApiResult<FriendsSummary>>("/api/friends", { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setFriends(result);
  }, [authHeaders, showToast, token]);

  const loadPracticeHistory = useCallback(async () => {
    if (!token) return;
    const result = await api<ApiResult<{ history: PracticeHistoryItem[] }>>("/api/practice/history", { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setPracticeHistory(result.history ?? []);
  }, [authHeaders, showToast, token]);

  const loadPublicRooms = useCallback(async () => {
    if (!token) return;
    const result = await api<ApiResult<{ rooms: PublicRoomSummary[] }>>("/api/rooms/public", { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setPublicRooms(result.rooms ?? []);
  }, [authHeaders, showToast, token]);

  const sendFriendRequest = async () => {
    const username = friendUsername.trim();
    if (!username) {
      showToast("Enter a username first.", "error");
      return;
    }
    const result = await api<ApiResult<FriendsSummary>>("/api/friends/request", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ username })
    });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setFriends(result);
    setFriendUsername("");
    showToast("Friend request updated.", "success");
    if (leaderboardScope === "friends") void loadLeaderboard("friends");
  };

  const respondToFriendRequest = async (requestId: string, accept: boolean) => {
    const result = await api<ApiResult<FriendsSummary>>(`/api/friends/${requestId}/respond`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ accept })
    });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setFriends(result);
    showToast(accept ? "Friend request accepted." : "Friend request declined.", "success");
    if (leaderboardScope === "friends") void loadLeaderboard("friends");
  };

  const loadDailyChallenge = useCallback(async () => {
    if (!token) return null;
    const result = await api<ApiResult<DailyChallengeSummary>>("/api/daily-challenge", { headers: authHeaders });
    if (result.error) {
      showToast(result.error, "error");
      return null;
    }
    setDailyChallenge(result);
    setSnapshot(null);
    setTyped("");
    setDailyEvents([]);
    setDailySaved(Boolean(result.myEntry));
    setIsDailyRunning(false);
    return result;
  }, [authHeaders, showToast, token]);

  const loadPractice = async (mode = practiceMode, duration = practiceDuration, difficulty = practiceDifficulty, language = codeLanguage) => {
    const nextDuration = normalizePracticeDuration(duration);
    const result = await api<ApiResult<{ prompt: string; vocabulary?: VocabularyEntry[] }>>(`/api/practice?mode=${mode}&duration=${nextDuration}&difficulty=${difficulty}&codeLanguage=${language}`, { headers: authHeaders });
    if (result.error || !result.prompt) {
      setPracticePrompt("");
      setVocabularyEntries([]);
      if (result.error === "Authentication required.") {
        setToken("");
        setUser(null);
        localStorage.removeItem("vk_token");
        localStorage.removeItem("vk_user");
      }
      showToast(result.error ?? "Practice could not load. Make sure PostgreSQL is running, then refresh.", "error");
      return "";
    }
    setPracticePrompt(result.prompt);
    setVocabularyEntries(result.vocabulary ?? []);
    setSnapshot(null);
    setTyped("");
    setPracticeMode(mode);
    setCodeLanguage(language);
    setPracticeDuration(nextDuration);
    setPracticeDifficulty(difficulty);
    setPracticeEvents([]);
    setPracticeResult(null);
    setPracticeSaved(false);
    setIsPracticeRunning(false);
    setActiveView("practice");
    showToast("Practice prompt ready. Pick a timer and press Start Practice.");
    return result.prompt;
  };

  const updatePracticeDuration = (minutes: number, seconds: number) => {
    const nextDuration = normalizePracticeDuration(minutes * 60 + seconds);
    setPracticeDuration(nextDuration);
    void loadPractice(practiceMode, nextDuration, practiceDifficulty);
  };

  const switchPracticeMode = useCallback(() => {
    const currentIndex = practiceModes.findIndex((mode) => mode.value === practiceMode);
    const nextMode = practiceModes[(currentIndex + 1) % practiceModes.length];
    setPracticeMode(nextMode.value);
    void loadPractice(nextMode.value, practiceDuration, practiceDifficulty);
    showToast(`Practice mode switched to ${nextMode.label}.`);
  }, [practiceDifficulty, practiceDuration, practiceMode, showToast]);

  const extendPracticePrompt = useCallback((typedLength = typed.length) => {
    if (snapshot || !isPracticeRunning) return;
    setPracticePrompt((prompt) => {
      if (!prompt || prompt.length - typedLength > 450) return prompt;
      const next = makePracticeChunk(practiceMode, practiceDifficulty, codeLanguage);
      if (practiceMode === "VOCAB") {
        setVocabularyEntries((entries) => mergeVocabulary(entries, next.vocabulary));
      }
      return `${prompt} ${next.text}`;
    });
  }, [codeLanguage, isPracticeRunning, practiceDifficulty, practiceMode, snapshot, typed.length]);

  useEffect(() => {
    if (token && user && activeView === "practice" && !practicePrompt && !isPracticeRunning) {
      void loadPractice(practiceMode, practiceDuration, practiceDifficulty);
    }
  }, [activeView, isPracticeRunning, practiceDifficulty, practiceDuration, practiceMode, practicePrompt, token, user]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (activeView === "leaderboard") {
      void loadLeaderboard(leaderboardScope);
    }
    if (activeView === "profile") {
      void loadProfile();
    }
    if (activeView === "daily") {
      void loadDailyChallenge();
    }
    if (activeView === "friends") {
      void loadFriends();
    }
    if (activeView === "history") {
      void loadPracticeHistory();
    }
    if (activeView === "race" && roomVisibility === "public" && !raceSettingsLocked) {
      void loadPublicRooms();
    }
  }, [activeView, leaderboardScope, loadDailyChallenge, loadFriends, loadLeaderboard, loadPracticeHistory, loadProfile, loadPublicRooms, raceSettingsLocked, roomVisibility]);

  const createRoom = async (isPrivate: boolean) => {
    const result = await api<RaceSnapshot>("/api/rooms", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ isPrivate, textMode: textModeForPracticeMode(raceMode), raceMode, customText, codeLanguage, difficulty: raceDifficulty, durationSeconds: raceDuration })
    });
    setSnapshot(result);
    setActiveView("race");
    setTyped("");
    setRoomCode(result.roomCode);
    setRoomVisibility(result.isPrivate ? "private" : "public");
    setRaceDifficulty(result.difficulty);
    setRaceDuration(result.durationSeconds);
    setRaceMode(result.raceMode ?? "WORDS");
    setTextMode(textModeForPracticeMode(result.raceMode ?? "WORDS"));
    window.history.replaceState(null, "", `?room=${result.roomCode}`);
    if (isPrivate) showToast("Private invite link is ready to copy.", "success");
    if (!isPrivate) void loadPublicRooms();
    socket?.emit("room:join", { code: result.roomCode });
  };

  const joinRoomByCode = useCallback(async (code: string, spectator = false) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      showToast("Enter a room code or open an invite link.", "error");
      return null;
    }
    const result = await api<ApiResult<RaceSnapshot>>(`/api/rooms/${normalizedCode}/join`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ spectator })
    });
    if (result.error) {
      showToast(result.error, "error");
      return null;
    }
    setSnapshot(result);
    setActiveView("race");
    setTyped("");
    setRoomCode(result.roomCode);
    setRoomVisibility(result.isPrivate ? "private" : "public");
    setRaceDifficulty(result.difficulty);
    setRaceDuration(result.durationSeconds);
    setRaceMode(result.raceMode ?? "WORDS");
    setTextMode(textModeForPracticeMode(result.raceMode ?? "WORDS"));
    window.history.replaceState(null, "", `?room=${result.roomCode}`);
    void loadPublicRooms();
    socket?.emit("room:join", { code: result.roomCode, spectator });
    return result;
  }, [authHeaders, loadPublicRooms, showToast, socket]);

  const joinRoom = async (spectator = false) => {
    await joinRoomByCode(roomCode, spectator);
  };

  const copyInviteLink = async () => {
    if (!snapshot?.roomCode) {
      showToast("Create or join a room first.", "error");
      return;
    }
    const inviteLink = `${appOrigin || window.location.origin}?room=${snapshot.roomCode}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast("Invite link copied. Send it to your friend.", "success");
    } catch {
      showToast(inviteLink);
    }
  };

  useEffect(() => {
    if (!pendingInviteCode || !token || !user || !socket) return;
    void joinRoomByCode(pendingInviteCode).then((result) => {
      if (!result) return;
      setPendingInviteCode("");
      showToast(`Joined room ${result.roomCode} from invite link.`, "success");
    });
  }, [joinRoomByCode, pendingInviteCode, showToast, socket, token, user]);

  const matchmake = async () => {
    const result = await api<{ matched: boolean; snapshot?: RaceSnapshot }>("/api/matchmaking", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ textMode: textModeForPracticeMode(raceMode), raceMode, codeLanguage, difficulty: raceDifficulty, durationSeconds: raceDuration })
    });
    if (!result.matched || !result.snapshot) {
      showToast("Queued for ELO matchmaking. We will pair you inside a +/- 220 rating band.");
      return;
    }
    setSnapshot(result.snapshot);
    setActiveView("race");
    setRoomCode(result.snapshot.roomCode);
    setRoomVisibility(result.snapshot.isPrivate ? "private" : "public");
    setRaceDifficulty(result.snapshot.difficulty);
    setRaceDuration(result.snapshot.durationSeconds);
    setRaceMode(result.snapshot.raceMode ?? "WORDS");
    setTextMode(textModeForPracticeMode(result.snapshot.raceMode ?? "WORDS"));
    void loadPublicRooms();
    socket?.emit("room:join", { code: result.snapshot.roomCode });
  };

  const leaveRoom = async () => {
    if (!snapshot) return;
    const leavingCode = snapshot.roomCode;
    socket?.emit("room:leave", { code: leavingCode }, (response: ApiResult<{ snapshot?: RaceSnapshot }>) => {
      if (response?.error) showToast(response.error, "error");
    });
    setSnapshot(null);
    setTyped("");
    setRoomCode("");
    raceStartedAtRef.current = 0;
    lastStrokeAtRef.current = 0;
    setRaceStartedAt(0);
    setLastStrokeAt(0);
    window.history.replaceState(null, "", window.location.pathname);
    showToast(`Left room ${leavingCode}.`, "success");
    void loadPublicRooms();
  };

  const startRace = () => {
    if (!snapshot) return;
    setTyped("");
    raceStartedAtRef.current = 0;
    lastStrokeAtRef.current = 0;
    setRaceStartedAt(0);
    setLastStrokeAt(0);
    socket?.emit("race:start", { code: snapshot.roomCode }, (response: ApiResult<{ snapshot?: RaceSnapshot }>) => {
      if (response?.error) showToast(response.error, "error");
    });
  };

  const startPractice = async () => {
    const prompt = await loadPractice(practiceMode, practiceDuration, practiceDifficulty);
    if (!prompt) return;
    const now = Date.now();
    setSnapshot(null);
    setTyped("");
    setPracticeEvents([]);
    setPracticeResult(null);
    setPracticeSaved(false);
    setPracticeStartedAt(now);
    setIsPracticeRunning(true);
    lastStrokeAtRef.current = 0;
    inputRef.current?.focus();
  };

  const startDailyChallenge = async () => {
    const challenge = dailyChallenge ?? await loadDailyChallenge();
    if (!challenge) return;
    const now = Date.now();
    setSnapshot(null);
    setActiveView("daily");
    setTyped("");
    setDailyEvents([]);
    setDailySaved(false);
    setDailyStartedAt(now);
    setIsDailyRunning(true);
    lastStrokeAtRef.current = 0;
    inputRef.current?.focus();
  };

  const finishPractice = useCallback(async () => {
    if (!isPracticeRunning || practiceSaved) return;
    setIsPracticeRunning(false);
    setPracticeSaved(true);
    const result = await api<PracticeResult>("/api/practice/result", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        durationSeconds: practiceDuration,
        mode: practiceMode,
        difficulty: practiceDifficulty,
        codeLanguage,
        wpm: practiceMetrics.wpm,
        accuracy: practiceMetrics.accuracy,
        consistency: practiceMetrics.consistency,
        errors: practiceMetrics.errors,
        prompt: practicePrompt,
        events: practiceEvents,
        vocabulary: practiceMode === "VOCAB" ? vocabularyEntries : undefined
      })
    });
    setPracticeResult(result);
    showToast(`Practice complete: ${result.wpm} WPM, ${result.accuracy}% accuracy.`, "success");
    if (result.score >= 900 && result.accuracy >= 90) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 3200);
    }
    if (user) {
      const nextUser = { ...user, rating: result.ratingAfter };
      setUser(nextUser);
      localStorage.setItem("vk_user", JSON.stringify(nextUser));
    }
    void loadAnalytics();
  }, [authHeaders, isPracticeRunning, loadAnalytics, practiceDifficulty, practiceDuration, practiceEvents, practiceMetrics.accuracy, practiceMetrics.consistency, practiceMetrics.errors, practiceMetrics.wpm, practiceMode, practicePrompt, practiceSaved, showToast, user, vocabularyEntries]);

  const finishDailyChallenge = useCallback(async () => {
    if (!dailyChallenge || !isDailyRunning || dailySaved) return;
    setIsDailyRunning(false);
    setDailySaved(true);
    const result = await api<ApiResult<DailyChallengeSummary>>("/api/daily-challenge/result", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        challengeId: dailyChallenge.id,
        durationSeconds: dailyChallenge.durationSeconds,
        wpm: dailyMetrics.wpm,
        accuracy: dailyMetrics.accuracy,
        consistency: dailyMetrics.consistency,
        errors: dailyMetrics.errors
      })
    });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setDailyChallenge(result);
    showToast(`Daily challenge saved: ${dailyMetrics.wpm} WPM, score ${dailyMetrics.score}.`, "success");
    if (dailyMetrics.score >= 900 && dailyMetrics.accuracy >= 90) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 3200);
    }
  }, [authHeaders, dailyChallenge, dailyMetrics.accuracy, dailyMetrics.consistency, dailyMetrics.errors, dailyMetrics.score, dailyMetrics.wpm, dailySaved, isDailyRunning, showToast]);

  useEffect(() => {
    if (isPracticeRunning && practiceRemaining <= 0) {
      void finishPractice();
    }
  }, [finishPractice, isPracticeRunning, practiceRemaining]);

  useEffect(() => {
    if (isDailyRunning && (dailyRemaining <= 0 || typed.length >= target.length)) {
      void finishDailyChallenge();
    }
  }, [dailyRemaining, finishDailyChallenge, isDailyRunning, target.length, typed.length]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!user || shouldIgnoreShortcut(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeView === "daily") void startDailyChallenge();
        if (activeView === "practice") void startPractice();
      }
      if (event.key === "Tab" && activeView === "practice") {
        event.preventDefault();
        switchPracticeMode();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  });

  const onTyping = (value: string) => {
    if (!snapshot || snapshot.status !== "LIVE" || finished) return;
    if (value.length > snapshot.prompt.length) return;
    const now = Date.now();
    const started = raceStartedAtRef.current || raceStartedAt || now;
    const intervalMs = lastStrokeAtRef.current ? now - lastStrokeAtRef.current : 0;
    const isDelete = value.length < typed.length;
    const index = isDelete ? value.length : Math.max(0, value.length - 1);
    const key = isDelete ? "Backspace" : value[value.length - 1] ?? "";
    setTyped(value);
    raceStartedAtRef.current = started;
    lastStrokeAtRef.current = now;
    setRaceStartedAt(started);
    setLastStrokeAt(now);
    socket?.emit("race:keystroke", {
      code: snapshot.roomCode,
      event: {
        raceId: snapshot.raceId,
        index,
        key,
        expected: snapshot.prompt[index] ?? "",
        correct: key === snapshot.prompt[index],
        elapsedMs: now - started,
        intervalMs,
        typed: value
      }
    });
  };

  const onPracticeTyping = (value: string) => {
    if (!isPracticeRunning || !target) return;
    const now = Date.now();
    const started = practiceStartedAt || now;
    const intervalMs = lastStrokeAtRef.current ? now - lastStrokeAtRef.current : 0;
    const isDelete = value.length < typed.length;
    const index = isDelete ? value.length : Math.max(0, value.length - 1);
    const key = isDelete ? "Backspace" : value[value.length - 1] ?? "";
    setTyped(value);
    if (target.length - value.length < 450) {
      extendPracticePrompt(value.length);
    }
    lastStrokeAtRef.current = now;
    setPracticeEvents((events) => [
      ...events,
      {
        raceId: "practice",
        index,
        key,
        expected: target[index] ?? "",
        correct: key === target[index],
        elapsedMs: now - started,
        intervalMs,
        typed: value
      }
    ]);
  };

  const onDailyTyping = (value: string) => {
    if (!isDailyRunning || !target || value.length > target.length) return;
    const now = Date.now();
    const started = dailyStartedAt || now;
    const intervalMs = lastStrokeAtRef.current ? now - lastStrokeAtRef.current : 0;
    const isDelete = value.length < typed.length;
    const index = isDelete ? value.length : Math.max(0, value.length - 1);
    const key = isDelete ? "Backspace" : value[value.length - 1] ?? "";
    setTyped(value);
    lastStrokeAtRef.current = now;
    setDailyEvents((events) => [
      ...events,
      {
        raceId: "daily",
        index,
        key,
        expected: target[index] ?? "",
        correct: key === target[index],
        elapsedMs: now - started,
        intervalMs,
        typed: value
      }
    ]);
  };

  const handleTypeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const canTypeRace = snapshot && snapshot.status === "LIVE";
    const canTypeDaily = activeView === "daily" && isDailyRunning;
    const canTypePractice = activeView === "practice" && !snapshot && isPracticeRunning;
    if (!canTypeRace && !canTypePractice && !canTypeDaily) return;

    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = typed.slice(0, -1);
      snapshot ? onTyping(next) : canTypeDaily ? onDailyTyping(next) : onPracticeTyping(next);
      return;
    }
    if (event.key === "Enter" && (snapshot?.raceMode === "CODE" || practiceMode === "CODE")) {
      event.preventDefault();
      const next = `${typed}\n`;
      snapshot ? onTyping(next) : canTypeDaily ? onDailyTyping(next) : onPracticeTyping(next);
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      const next = `${typed}${event.key}`;
      snapshot ? onTyping(next) : canTypeDaily ? onDailyTyping(next) : onPracticeTyping(next);
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen overflow-hidden px-5 py-7 text-ink">
        <ToastStack toasts={toasts} />
        <section className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface/85 px-3 py-2 text-sm font-black uppercase shadow-soft backdrop-blur">
                <Keyboard className="h-4 w-4 text-mint" /> Velocity Keys
              </div>
              <button className={compactButton} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {theme === "light" ? "Dark" : "Light"}
              </button>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-xs font-black uppercase text-mint">
              <Sparkles className="h-3.5 w-3.5" /> Built for focused typing practice
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-normal md:text-7xl">
              Type cleaner. Climb higher.
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-muted">
              Practice with timed drills, race friends in private rooms, and track the progress that actually matters: speed, accuracy, consistency, and rating.
            </p>
            <div className="mt-7 max-w-2xl rounded-lg border border-line bg-panel/85 p-5 shadow-glow backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
                <div className="text-xs font-black uppercase text-muted">Practice Preview</div>
                <div className="font-mono text-sm font-black text-mint">64 WPM</div>
              </div>
              <div className="font-mono text-2xl font-black leading-10 md:text-3xl md:leading-[3rem]">
                <span className="text-muted">steady rhythm rewards </span>
                <span className="text-mint">clean accuracy</span>
                <span className="text-muted"> and calm corrections</span>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {["Private races", "Daily challenge", "Progress dashboard"].map((item) => (
                  <div className="rounded-lg border border-line bg-surface/70 px-3 py-2 text-center text-xs font-black uppercase text-muted" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-lg border border-line bg-panel/95 p-5 pt-6 shadow-glow backdrop-blur-xl">
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/75 px-3 py-1 text-xs font-black uppercase text-muted">
                <Check className="h-3.5 w-3.5 text-mint" /> Ready to play locally
              </div>
              <h2 className="mt-3 text-3xl font-black">{authMode === "login" ? "Welcome back" : "Create your racer"}</h2>
              <p className="mt-1 text-sm font-medium text-muted">Save your tests, rooms, ratings, achievements, and typing history.</p>
            </div>
            <div className="mb-4 flex gap-2">
              <button className={tab(authMode === "login")} onClick={() => setAuthMode("login")}><LogIn className="h-4 w-4" /> Login</button>
              <button className={tab(authMode === "register")} onClick={() => setAuthMode("register")}><Plus className="h-4 w-4" /> Sign up</button>
            </div>
            {authMode === "register" && (
              <input className={field} placeholder="username" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
            )}
            <input className={field} placeholder="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
            <input className={field} placeholder="password" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            {authError && <p className="mb-3 text-sm font-semibold text-coral">{authError}</p>}
            <button className={primaryButton} onClick={submitAuth}>{authMode === "login" ? "Enter arena" : "Create account"}</button>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-line bg-surface/70 p-3">
                <div className="font-mono text-lg font-black">6</div>
                <div className="text-[10px] font-black uppercase text-muted">Modes</div>
              </div>
              <div className="rounded-lg border border-line bg-surface/70 p-3">
                <div className="font-mono text-lg font-black">15m</div>
                <div className="text-[10px] font-black uppercase text-muted">Timer</div>
              </div>
              <div className="rounded-lg border border-line bg-surface/70 p-3">
                <div className="font-mono text-lg font-black">ELO</div>
                <div className="text-[10px] font-black uppercase text-muted">Rating</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 text-ink md:px-8">
      <ToastStack toasts={toasts} />
      {celebrate && <FinishCelebration />}
      <header className="glass-panel mx-auto mb-6 flex max-w-[1500px] flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-panel/80 px-5 py-5 shadow-soft backdrop-blur-xl">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-black uppercase text-muted">
            <Sparkles className="h-3.5 w-3.5 text-brass" /> Real-time Typing Arena
          </div>
          <h1 className="text-4xl font-black md:text-5xl">Velocity Keys</h1>
          <p className="mt-1 text-base font-semibold text-muted md:text-lg">{user.username} · {user.rating} ELO · {levelForRating(user.rating)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={activeView === "practice" ? activeCompactButton : compactButton} onClick={() => { setActiveView("practice"); void loadPractice(); }}><Target className="h-4 w-4" /> Practice</button>
          <button className={activeView === "race" ? activeCompactButton : compactButton} onClick={() => setActiveView("race")}><Users className="h-4 w-4" /> Race</button>
          <button className={activeView === "daily" ? activeCompactButton : compactButton} onClick={() => { setActiveView("daily"); void loadDailyChallenge(); }}><CalendarDays className="h-4 w-4" /> Daily</button>
          <button className={activeView === "friends" ? activeCompactButton : compactButton} onClick={() => { setActiveView("friends"); void loadFriends(); }}><UserPlus className="h-4 w-4" /> Friends</button>
          <button className={activeView === "leaderboard" ? activeCompactButton : compactButton} onClick={() => setActiveView("leaderboard")}><Trophy className="h-4 w-4" /> Leaderboard</button>
          <button className={activeView === "history" ? activeCompactButton : compactButton} onClick={() => { setActiveView("history"); void loadPracticeHistory(); }}><History className="h-4 w-4" /> History</button>
          <button className={activeView === "profile" ? activeCompactButton : compactButton} onClick={() => { setActiveView("profile"); void loadProfile(); }}><Users className="h-4 w-4" /> Profile</button>
          <button className={compactButton} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {theme === "light" ? "Dark" : "Light"}</button>
          <button className={compactButton} onClick={loadAnalytics}><RefreshCcw className="h-4 w-4" /> Refresh</button>
          <button className={compactButton} onClick={() => { localStorage.clear(); location.reload(); }}>Logout</button>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          {activeView === "practice" && (
            <div className="grid gap-3 md:grid-cols-3">
              <StatusPill label="Mode" value={practiceMode.toLowerCase()} />
              <StatusPill label="Difficulty" value={practiceDifficulty.toLowerCase()} />
              <StatusPill label="Timer" value={formatDuration(practiceDuration)} />
            </div>
          )}
          {activeView === "leaderboard" ? (
            <LeaderboardView
              leaderboard={leaderboard}
              scope={leaderboardScope}
              onOpenProfile={(profile) => {
                setProfileUser(profile);
                setActiveView("profile");
                void loadProfile(profile.id);
              }}
              onScopeChange={(scope) => {
                setLeaderboardScope(scope);
                void loadLeaderboard(scope);
              }}
            />
          ) : activeView === "profile" ? (
            <ProfileView profile={profileUser} currentUserId={user.id} analytics={safeAnalytics} />
          ) : activeView === "daily" ? (
            <DailyChallengeView
              challenge={dailyChallenge}
              typed={typed}
              target={target}
              metrics={dailyMetrics}
              remaining={dailyRemaining}
              running={isDailyRunning}
              inputRef={inputRef}
              onKeyDown={handleTypeKey}
              onStart={startDailyChallenge}
              onFinish={finishDailyChallenge}
            />
          ) : activeView === "friends" ? (
            <FriendsView
              friends={friends}
              username={friendUsername}
              onUsernameChange={setFriendUsername}
              onSendRequest={sendFriendRequest}
              onRespond={respondToFriendRequest}
              onOpenProfile={(profileId) => {
                setActiveView("profile");
                void loadProfile(profileId);
              }}
            />
          ) : activeView === "history" ? (
            <PracticeHistoryView history={practiceHistory} />
          ) : (
            <>
          <Panel title={activeView === "race" ? snapshot ? `${snapshot.isPrivate ? "Private" : "Public"} Room ${snapshot.roomCode}` : "Race Track" : "Practice Track"} icon={<Keyboard className="h-4 w-4" />}>
            {snapshot?.status === "FINISHED" ? (
              <div className="mb-4 grid gap-2 md:grid-cols-4">
                <Metric label="Final WPM" value={String(me?.wpm ?? 0)} />
                <Metric label="Accuracy" value={`${me?.accuracy ?? 100}%`} />
                <Metric label="Progress" value={`${me?.progress ?? 0}%`} />
                <Metric label="Placement" value={me?.placement ? `#${me.placement}` : "-"} />
              </div>
            ) : snapshot ? (
              <div className="mb-4 rounded-lg border border-line bg-surface/80 p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase text-muted">{snapshot.status === "WAITING" ? "Ready Check" : snapshot.status === "COUNTDOWN" ? "Countdown" : "Race Timer"}</div>
                    <div className="mt-1 font-mono text-3xl font-black">{snapshot.status === "LIVE" ? formatDuration(raceRemaining) : snapshot.status === "COUNTDOWN" ? countdown : racerCount < 2 ? "Need 2 racers" : `${readyCount}/${racerCount} ready`}</div>
                  </div>
                  <div className="grid min-w-[260px] grid-cols-3 gap-2 text-sm">
                    <Metric label="Mode" value={(snapshot.raceMode ?? "WORDS") === "CODE" ? formatCodeLanguage(snapshot.codeLanguage ?? "CPP") : formatModeLabel(snapshot.raceMode ?? "WORDS")} />
                    <Metric label="Difficulty" value={titleCase(snapshot.difficulty)} />
                    <Metric label="Length" value={formatDuration(snapshot.durationSeconds)} />
                  </div>
                </div>
                {snapshot.status === "WAITING" && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-mint transition-all duration-500" style={{ width: `${racerCount ? (readyCount / racerCount) * 100 : 0}%` }} />
                  </div>
                )}
              </div>
            ) : practiceResult ? (
              <div className="mb-4 grid gap-2 md:grid-cols-4">
                <Metric label="Final WPM" value={String(practiceResult.wpm)} />
                <Metric label="Accuracy" value={`${practiceResult.accuracy}%`} />
                <Metric label="Score" value={String(practiceResult.score)} />
                <Metric label="Errors" value={String(practiceMetrics.errors)} />
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-line bg-surface/75 p-4 text-sm font-semibold text-muted">
                Start practice to type without live score pressure. Your WPM, accuracy, score, and errors will appear after the session ends.
              </div>
            )}
            {snapshot?.status === "COUNTDOWN" && <div className="mb-4 animate-pulse bg-ink px-4 py-4 text-center text-5xl font-black text-white">{countdown}</div>}
            {!snapshot && isPracticeRunning && <div className="mb-4 bg-ink px-4 py-3 text-center text-4xl font-black text-white">{formatDuration(practiceRemaining)}</div>}
            {!snapshot && (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <button className={primaryButton} onClick={startPractice}><Play className="h-4 w-4" /> Start Practice</button>
                <button className={secondaryButton} onClick={startPractice}><Target className="h-4 w-4" /> Restart Practice</button>
              </div>
            )}
            <TypingText
              ref={inputRef}
              prompt={target}
              typed={typed}
              code={snapshot?.raceMode === "CODE" || (!snapshot && practiceMode === "CODE") || raceMode === "CODE"}
              focusIndex={typed.length}
              active={Boolean(snapshot ? snapshot.status === "LIVE" : isPracticeRunning)}
              onKeyDown={handleTypeKey}
            />
            {activeView === "race" ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button className={primaryButton} onClick={startRace} disabled={!snapshot || snapshot.status !== "WAITING" || amReady}>
                  <Play className="h-4 w-4" /> {amReady ? "Waiting For Others" : "Ready / Start Race"}
                </button>
                <button className={secondaryButton} onClick={() => setTyped("")}>Clear</button>
                <button className={secondaryButton} onClick={leaveRoom} disabled={!snapshot}>Leave Room</button>
              </div>
            ) : (
              null
            )}
            {practiceResult && !snapshot && (
              <div className="mt-4 rounded-lg border border-line bg-surface/80 p-4 shadow-soft">
                {practiceResult.vocabulary?.length ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-muted"><BookOpen className="h-4 w-4" /> Words Used In The Sentences</h3>
                    <div className="grid gap-2 md:grid-cols-2">
                      {practiceResult.vocabulary.slice(0, 12).map((entry) => (
                        <div className="rounded-lg border border-line bg-panel/80 p-3" key={entry.word}>
                          <div className="font-mono text-base font-black">{entry.word}</div>
                          <div className="mt-1 text-sm text-muted">{entry.meaning}</div>
                          <div className="mt-2 text-xs text-muted/75">{entry.example}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          {activeView === "race" && (
            <Panel title="Leaderboard" icon={<Trophy className="h-4 w-4" />}>
              <div className="space-y-2">
                {(snapshot?.players ?? []).map((player, index) => (
                  <div key={player.userId} className="grid grid-cols-[28px_1fr_64px] items-center gap-3 rounded-lg border border-line bg-surface/75 p-3 shadow-sm">
                    <strong>{index + 1}</strong>
                    <div>
                      <div className="flex justify-between gap-3 text-sm font-bold">
                        <span>{player.username}</span>
                        <span>{snapshot?.status === "WAITING" ? player.ready ? "Ready" : "Not ready" : `${player.rating} pts`}</span>
                      </div>
                      <div className="mt-2 h-2 bg-line"><div className="h-full bg-mint" style={{ width: `${player.progress}%` }} /></div>
                    </div>
                    <span className="text-right font-mono text-sm">{snapshot?.status === "WAITING" ? `${player.progress}%` : `${player.wpm} WPM`}</span>
                  </div>
                ))}
                {!snapshot && <p className="text-sm text-muted">Create, join, or matchmake into a room to see live opponents.</p>}
              </div>
            </Panel>
          )}
            </>
          )}
        </section>

        <aside className="space-y-4">
          {activeView === "practice" ? (
            <Panel title="Practice Settings" icon={<Timer className="h-4 w-4" />}>
              <label className="text-xs font-bold uppercase text-muted">Timer</label>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[30, 60, 120].map((seconds) => (
                  <button
                    className={practiceDuration === seconds ? activeControl : secondaryButton}
                    key={seconds}
                    onClick={() => {
                      setPracticeDuration(seconds);
                      void loadPractice(practiceMode, seconds, practiceDifficulty);
                    }}
                  >
                    {seconds === 30 ? "30 sec" : seconds === 60 ? "1 min" : "2 min"}
                  </button>
                ))}
              </div>
              <div className="mb-3 rounded-lg border border-line bg-surface/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-muted">Custom timer</span>
                  <span className="font-mono text-sm font-black">{formatDuration(practiceDuration)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <label className="text-xs font-bold uppercase text-muted">
                    Minutes
                    <select
                      aria-label="Practice timer minutes"
                      className={timerSelect}
                      size={6}
                      value={customTimerMinutes}
                      onChange={(event) => updatePracticeDuration(Number(event.target.value), customTimerSeconds)}
                    >
                      {minuteOptions.map((minute) => (
                        <option className="py-2 text-center font-mono text-lg font-black" key={minute} value={minute}>
                          {String(minute).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="pt-5 font-mono text-2xl font-black text-muted">:</div>
                  <label className="text-xs font-bold uppercase text-muted">
                    Seconds
                    <select
                      aria-label="Practice timer seconds"
                      className={timerSelect}
                      size={6}
                      value={customTimerSeconds}
                      onChange={(event) => updatePracticeDuration(customTimerMinutes, Number(event.target.value))}
                    >
                      {secondOptions.map((second) => {
                        const disabled = (customTimerMinutes === 0 && second === 0) || (customTimerMinutes === 15 && second > 0);
                        return (
                          <option className="py-2 text-center font-mono text-lg font-black" disabled={disabled} key={second} value={second}>
                            {String(second).padStart(2, "0")}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
                <div className="mt-2 text-xs font-medium text-muted">Scroll the columns to choose anything from 00:01 to 15:00.</div>
              </div>
              <label className="text-xs font-bold uppercase text-muted">Difficulty</label>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {practiceDifficulties.map((difficulty) => (
                  <button
                    className={practiceDifficulty === difficulty.value ? activeControl : secondaryButton}
                    key={difficulty.value}
                    onClick={() => {
                      setPracticeDifficulty(difficulty.value);
                      void loadPractice(practiceMode, practiceDuration, difficulty.value);
                    }}
                  >
                    {difficulty.label}
                  </button>
                ))}
              </div>
              <label className="text-xs font-bold uppercase text-muted">Format</label>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {practiceModes.map((mode) => (
                  <button
                    className={practiceMode === mode.value ? activeControl : secondaryButton}
                    key={mode.value}
                    onClick={() => {
                      setPracticeMode(mode.value);
                      void loadPractice(mode.value, practiceDuration, practiceDifficulty, codeLanguage);
                    }}
                  >
                    {mode.icon} {mode.label}
                  </button>
                ))}
              </div>
              {practiceMode === "CODE" && (
                <>
                  <label className="text-xs font-bold uppercase text-muted">Code language</label>
                  <select
                    className={field}
                    value={codeLanguage}
                    onChange={(event) => {
                      const language = event.target.value as CodeLanguage;
                      setCodeLanguage(language);
                      void loadPractice(practiceMode, practiceDuration, practiceDifficulty, language);
                    }}
                  >
                    {codeLanguages.map((language) => (
                      <option key={language.value} value={language.value}>{language.label}</option>
                    ))}
                  </select>
                </>
              )}
              <button className={primaryButton} onClick={startPractice}><Play className="h-4 w-4" /> Start Practice</button>
              <button className={`${secondaryButton} mt-2`} onClick={() => void finishPractice()} disabled={!isPracticeRunning}><Square className="h-4 w-4" /> Finish</button>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm">
                <div className="flex justify-between font-bold"><span>Current level</span><span>{levelForRating(user.rating)}</span></div>
                <div className="mt-1 text-muted">Rating changes reward clean speed over raw speed.</div>
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                <div><kbd className={kbdClass}>Esc</kbd> restarts the current practice run.</div>
                <div className="mt-2"><kbd className={kbdClass}>Tab</kbd> switches to the next practice mode.</div>
              </div>
            </Panel>
          ) : activeView === "race" ? (
            <>
              <Panel title="Race Lobby" icon={<Users className="h-4 w-4" />}>
                {raceSettingsLocked && (
                  <div className="mb-3 rounded-lg border border-line bg-surface/70 p-3 text-xs font-bold uppercase text-muted">
                    Room settings are locked until this race ends.
                  </div>
                )}
                <label className="text-xs font-bold uppercase text-muted">Mode</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {practiceModes.map((mode) => (
                    <button
                      className={controlButton(raceMode === mode.value, raceSettingsLocked)}
                      disabled={raceSettingsLocked}
                      key={mode.value}
                      onClick={() => {
                        setRaceMode(mode.value);
                        setTextMode(textModeForPracticeMode(mode.value));
                      }}
                    >
                      {mode.icon} {mode.label}
                    </button>
                  ))}
                </div>
                {raceMode === "CODE" && (
                  <>
                    <label className="text-xs font-bold uppercase text-muted">Code language</label>
                    <select className={field} disabled={raceSettingsLocked} value={codeLanguage} onChange={(e) => setCodeLanguage(e.target.value as CodeLanguage)}>
                      {codeLanguages.map((language) => (
                        <option key={language.value} value={language.value}>{language.label}</option>
                      ))}
                    </select>
                  </>
                )}
                <label className="text-xs font-bold uppercase text-muted">Difficulty</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {practiceDifficulties.map((difficulty) => (
                    <button
                      className={controlButton(raceDifficulty === difficulty.value, raceSettingsLocked)}
                      disabled={raceSettingsLocked}
                      key={difficulty.value}
                      onClick={() => setRaceDifficulty(difficulty.value)}
                    >
                      {difficulty.label}
                    </button>
                  ))}
                </div>
                <label className="text-xs font-bold uppercase text-muted">Race time</label>
                <select className={field} disabled={raceSettingsLocked} value={raceDuration} onChange={(event) => setRaceDuration(Number(event.target.value))}>
                  {raceTimeOptions.map((seconds) => (
                    <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>
                  ))}
                </select>
                <label className="text-xs font-bold uppercase text-muted">Optional custom race text</label>
                <textarea className={`${field} min-h-24 resize-none`} disabled={raceSettingsLocked} placeholder="Leave empty for continuous generated text" value={customText} onChange={(e) => setCustomText(e.target.value)} />
                <label className="text-xs font-bold uppercase text-muted">Room type</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    className={controlButton(roomVisibility === "private", raceSettingsLocked)}
                    disabled={raceSettingsLocked}
                    onClick={() => setRoomVisibility("private")}
                  >
                    <Lock className="h-4 w-4" /> Private
                  </button>
                  <button
                    className={controlButton(roomVisibility === "public", raceSettingsLocked)}
                    disabled={raceSettingsLocked}
                    onClick={() => {
                      setRoomVisibility("public");
                      void loadPublicRooms();
                    }}
                  >
                    <Flag className="h-4 w-4" /> Public
                  </button>
                </div>
                {roomVisibility === "public" && (
                  <div className="mb-3 rounded-lg border border-line bg-surface/70 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-muted">Open public rooms</span>
                      <button className="rounded border border-line bg-panel/80 px-2 py-1 text-xs font-bold" disabled={raceSettingsLocked} onClick={() => void loadPublicRooms()}>
                        Refresh
                      </button>
                    </div>
                    <div className="space-y-2">
                      {publicRooms.length ? publicRooms.map((room) => (
                        <div className="rounded-lg border border-line bg-panel/75 p-3" key={room.roomCode}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-mono text-sm font-black">{room.roomCode}</div>
                              <div className="mt-1 text-xs font-bold text-muted">
                                {room.raceMode === "CODE" ? formatCodeLanguage(room.codeLanguage ?? "CPP") : formatModeLabel(room.raceMode)} · {titleCase(room.difficulty)} · {formatDuration(room.durationSeconds)}
                              </div>
                            </div>
                            <div className="text-right text-xs font-black text-muted">{room.players}/{room.capacity}</div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button className={secondaryButton} disabled={raceSettingsLocked || room.players >= room.capacity} onClick={() => void joinRoomByCode(room.roomCode, false)}>Join</button>
                            <button className={secondaryButton} disabled={raceSettingsLocked} onClick={() => void joinRoomByCode(room.roomCode, true)}><Eye className="h-4 w-4" /> Watch</button>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed border-line bg-panel/55 p-3 text-sm font-medium text-muted">
                          No public rooms waiting right now. Create one and it will appear here.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <button className={primaryButton} disabled={raceSettingsLocked} onClick={() => createRoom(roomVisibility === "private")}>
                  <Plus className="h-4 w-4" /> Create {roomVisibility === "private" ? "Private" : "Public"} Room
                </button>
                {snapshot?.roomCode ? (
                  <div className="my-3 rounded-lg border border-line bg-surface/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-muted">
                      <LinkIcon className="h-3.5 w-3.5" /> Room invite link
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <input
                        className="w-full rounded-lg border border-line bg-panel/85 px-3 py-2 font-mono text-xs outline-none"
                        readOnly
                        value={`${appOrigin || "http://localhost:3000"}?room=${snapshot.roomCode}`}
                      />
                      <button className={secondaryButton} onClick={copyInviteLink}><Copy className="h-4 w-4" /> Copy</button>
                    </div>
                  </div>
                ) : null}
                <input className={field} disabled={raceSettingsLocked} placeholder="Room code" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} />
                <div className="grid grid-cols-2 gap-2">
                  <button className={secondaryButton} disabled={raceSettingsLocked} onClick={() => joinRoom(false)}>Join</button>
                  <button className={secondaryButton} disabled={raceSettingsLocked} onClick={() => joinRoom(true)}><Eye className="h-4 w-4" /> Watch</button>
                </div>
                <button className={primaryButton} disabled={raceSettingsLocked} onClick={matchmake}><Radar className="h-4 w-4" /> ELO Matchmaking</button>
              </Panel>

              <Panel title="Anti-Cheat" icon={<ShieldAlert className="h-4 w-4" />}>
                <Metric label="Cheat score" value={`${me?.cheatScore ?? 0}/100`} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {(me?.cheatFlags.length ? me.cheatFlags : ["clean so far"]).map((flag) => (
                    <span className="rounded border border-line bg-surface/70 px-2 py-1 text-xs font-bold" key={flag}>{flag}</span>
                  ))}
                </div>
              </Panel>
            </>
          ) : activeView === "daily" ? (
            <Panel title="Daily Rules" icon={<CalendarDays className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Time" value={formatDuration(dailyChallenge?.durationSeconds ?? 60)} />
                <Metric label="Entries" value={String(dailyChallenge?.leaderboard.length ?? 0)} />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                One fixed prompt is shared by everyone each day. Replays are allowed, but only your best score stays on today&apos;s board.
              </div>
              {dailyChallenge?.myEntry ? (
                <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium">
                  Your best today: <span className="font-mono font-black">{dailyChallenge.myEntry.score}</span> score at <span className="font-mono font-black">{dailyChallenge.myEntry.wpm}</span> WPM.
                </div>
              ) : null}
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                <kbd className={kbdClass}>Esc</kbd> restarts the current daily run.
              </div>
            </Panel>
          ) : activeView === "friends" ? (
            <Panel title="Friend System" icon={<UserPlus className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Friends" value={String(friends?.friends.length ?? 0)} />
                <Metric label="Requests" value={String(friends?.incoming.length ?? 0)} />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                Send requests by exact username. Accepted friends appear in the Friends leaderboard scope.
              </div>
              <button className={`${secondaryButton} mt-3`} onClick={() => void loadFriends()}>
                <RefreshCcw className="h-4 w-4" /> Refresh friends
              </button>
            </Panel>
          ) : activeView === "history" ? (
            <Panel title="History Summary" icon={<History className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Tests" value={String(practiceHistory.length)} />
                <Metric label="Best WPM" value={String(Math.max(0, ...practiceHistory.map((item) => item.wpm)))} />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                Every completed practice test is saved with mode, difficulty, language, score, accuracy, consistency, and date.
              </div>
              <button className={`${secondaryButton} mt-3`} onClick={() => void loadPracticeHistory()}>
                <RefreshCcw className="h-4 w-4" /> Refresh history
              </button>
            </Panel>
          ) : activeView === "leaderboard" ? (
            <Panel title="Leaderboard Guide" icon={<Trophy className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Public users" value={String(leaderboard?.users.length ?? 0)} />
                <Metric label="Scope" value={leaderboardScope} />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                Public ranks everyone by ELO. Friends shows only users whose friend requests were accepted.
              </div>
              <button className={`${secondaryButton} mt-3`} onClick={() => void loadLeaderboard(leaderboardScope)}>
                <RefreshCcw className="h-4 w-4" /> Refresh leaderboard
              </button>
            </Panel>
          ) : (
            <Panel title="Profile Summary" icon={<Users className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Rating" value={String(profileUser?.rating ?? user.rating)} />
                <Metric label="Level" value={profileUser?.level ?? levelForRating(user.rating)} />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                Profile stats combine multiplayer races and normal practice sessions. Finish practice tests to increase total typing time and practice count.
              </div>
              <button className={`${secondaryButton} mt-3`} onClick={() => void loadProfile(profileUser?.id ?? "me")}>
                <RefreshCcw className="h-4 w-4" /> Refresh profile
              </button>
            </Panel>
          )}

          {activeView === "race" && (
            <Panel title="Ghost Replay" icon={<Bot className="h-4 w-4" />}>
              <p className="mb-3 text-sm text-muted">Completed race keystrokes are stored with elapsed timing so a replay runner can render previous lines stroke by stroke.</p>
              <div className="space-y-2">
                {safeAnalytics.recentRaces.map((race) => (
                  <div className="rounded-lg border border-line bg-surface/75 p-2 text-sm" key={race.id}>
                    <div className="flex justify-between font-bold"><span>{race.wpm} WPM</span><span>#{race.placement ?? "-"}</span></div>
                    <div className="text-xs text-muted">{new Date(race.date).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-lg border border-line bg-panel/85 p-4 pt-5 shadow-soft backdrop-blur-xl">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-normal text-muted">{icon}{title}</h2>
      {children}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel/75 px-4 py-3 shadow-soft backdrop-blur-xl">
      <div className="text-[10px] font-black uppercase text-muted">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-black capitalize">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface/82 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="text-[11px] font-black uppercase text-muted">{label}</div>
      <div className="mt-1 truncate font-mono text-xl font-black">{value}</div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-bold shadow-glow backdrop-blur-xl ${
            toast.tone === "success"
              ? "border-mint bg-mint/90 text-white"
              : toast.tone === "error"
                ? "border-coral bg-coral/90 text-white"
                : "border-line bg-panel/95 text-ink"
          }`}
          key={toast.id}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function FinishCelebration() {
  const pieces = Array.from({ length: 28 }, (_, index) => index);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div className="absolute left-1/2 top-8 flex -translate-x-1/2 items-center gap-2 rounded-full border border-mint bg-panel/95 px-5 py-3 font-black text-ink shadow-glow backdrop-blur-xl">
        <Sparkles className="h-5 w-5 text-brass" /> Strong finish
      </div>
      {pieces.map((piece) => (
        <span
          className="celebration-piece"
          key={piece}
          style={{
            left: `${8 + (piece * 31) % 86}%`,
            animationDelay: `${(piece % 9) * 0.08}s`,
            background: piece % 3 === 0 ? "rgb(var(--color-mint))" : piece % 3 === 1 ? "rgb(var(--color-brass))" : "rgb(var(--color-sky))"
          }}
        />
      ))}
    </div>
  );
}

function LeaderboardView({
  leaderboard,
  scope,
  onOpenProfile,
  onScopeChange
}: {
  leaderboard: LeaderboardSummary | null;
  scope: LeaderboardScope;
  onOpenProfile: (profile: LeaderboardUser) => void;
  onScopeChange: (scope: LeaderboardScope) => void;
}) {
  const users = leaderboard?.users ?? [];

  return (
    <Panel title="Leaderboard" icon={<Trophy className="h-4 w-4" />}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className={scope === "public" ? activeControl : secondaryButton} onClick={() => onScopeChange("public")}>
            <Trophy className="h-4 w-4" /> Public
          </button>
          <button className={scope === "friends" ? activeControl : secondaryButton} onClick={() => onScopeChange("friends")}>
            <Users className="h-4 w-4" /> Friends
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-surface/65">
          <div className="grid grid-cols-[54px_1fr_90px_90px_90px] gap-3 border-b border-line bg-panel/75 px-3 py-2 text-[11px] font-black uppercase text-muted">
            <span>Rank</span>
            <span>User</span>
            <span className="text-right">Rating</span>
            <span className="text-right">Best</span>
            <span className="text-right">Tests</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {users.map((profile, index) => (
              <button
                className="grid w-full grid-cols-[54px_1fr_90px_90px_90px] items-center gap-3 border-b border-line px-3 py-3 text-left transition last:border-b-0 hover:bg-panel/80"
                key={profile.id}
                onClick={() => onOpenProfile(profile)}
              >
                <span className="font-mono text-lg font-black">#{index + 1}</span>
                <span>
                  <span className="block font-black">{profile.username}</span>
                  <span className="block text-xs font-semibold text-muted">{profile.level} · {profile.wins} wins · {profile.podiums} podiums</span>
                </span>
                <span className="text-right font-mono font-black">{profile.rating}</span>
                <span className="text-right font-mono font-black">{profile.bestWpm}</span>
                <span className="text-right font-mono font-black">{profile.practiceTestsDone + profile.racesDone}</span>
              </button>
            ))}
            {!users.length && (
              <div className="p-6 text-sm font-semibold text-muted">
                {scope === "friends" ? "Accept a friend request to unlock your friends leaderboard." : "No users yet. Create a few accounts or finish some tests to populate the board."}
              </div>
            )}
          </div>
        </div>
    </Panel>
  );
}

function FriendsView({
  friends,
  username,
  onUsernameChange,
  onSendRequest,
  onRespond,
  onOpenProfile
}: {
  friends: FriendsSummary | null;
  username: string;
  onUsernameChange: (value: string) => void;
  onSendRequest: () => void;
  onRespond: (requestId: string, accept: boolean) => void;
  onOpenProfile: (profileId: string) => void;
}) {
  const accepted = friends?.friends ?? [];
  const incoming = friends?.incoming ?? [];
  const outgoing = friends?.outgoing ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Friends" icon={<UserPlus className="h-4 w-4" />}>
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            className="w-full rounded-lg border border-line bg-surface/85 px-3 py-2 outline-none ring-mint/30 transition focus:ring-4"
            placeholder="Enter exact username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSendRequest();
            }}
          />
          <button className={primaryButton} onClick={onSendRequest}><UserPlus className="h-4 w-4" /> Send Request</button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface/65">
            <div className="border-b border-line bg-panel/75 px-4 py-3 text-xs font-black uppercase text-muted">Incoming Requests</div>
            <div className="divide-y divide-line">
              {incoming.map((request) => (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={request.id}>
                  <div>
                    <div className="font-black">{request.requester.username}</div>
                    <div className="text-xs font-semibold text-muted">{request.requester.rating} rating · {request.requester.level}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className={iconButton} title="Accept request" onClick={() => onRespond(request.id, true)}><Check className="h-4 w-4" /></button>
                    <button className={iconButton} title="Decline request" onClick={() => onRespond(request.id, false)}><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              {!incoming.length && <div className="px-4 py-5 text-sm font-semibold text-muted">No incoming requests yet.</div>}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface/65">
            <div className="border-b border-line bg-panel/75 px-4 py-3 text-xs font-black uppercase text-muted">Outgoing Requests</div>
            <div className="divide-y divide-line">
              {outgoing.map((request) => (
                <div className="flex items-center justify-between gap-3 px-4 py-3" key={request.id}>
                  <div>
                    <div className="font-black">{request.addressee.username}</div>
                    <div className="text-xs font-semibold text-muted">Pending since {new Date(request.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className="rounded-full border border-line bg-panel/80 px-2.5 py-1 text-[10px] font-black uppercase text-muted">Pending</span>
                </div>
              ))}
              {!outgoing.length && <div className="px-4 py-5 text-sm font-semibold text-muted">No pending sent requests.</div>}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="My Friends" icon={<Users className="h-4 w-4" />}>
        <div className="overflow-hidden rounded-lg border border-line bg-surface/65">
          <div className="grid grid-cols-[1fr_110px_140px] gap-3 border-b border-line bg-panel/75 px-3 py-2 text-[11px] font-black uppercase text-muted">
            <span>User</span>
            <span className="text-right">Rating</span>
            <span className="text-right">Profile</span>
          </div>
          {accepted.map((friend) => (
            <div className="grid grid-cols-[1fr_110px_140px] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0" key={friend.id}>
              <span>
                <span className="block font-black">{friend.username}</span>
                <span className="block text-xs font-semibold text-muted">{friend.level}</span>
              </span>
              <span className="text-right font-mono font-black">{friend.rating}</span>
              <button className={secondaryButton} onClick={() => onOpenProfile(friend.id)}>Open</button>
            </div>
          ))}
          {!accepted.length && (
            <div className="p-6 text-sm font-semibold text-muted">
              Add someone by username or accept an incoming request to build your friends leaderboard.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function PracticeHistoryView({ history }: { history: PracticeHistoryItem[] }) {
  return (
    <Panel title="Practice History" icon={<History className="h-4 w-4" />}>
      <div className="overflow-hidden rounded-lg border border-line bg-surface/65">
        <div className="grid grid-cols-[1.1fr_90px_90px_90px_90px_1fr] gap-3 border-b border-line bg-panel/75 px-3 py-2 text-[11px] font-black uppercase text-muted">
          <span>Date</span>
          <span>Mode</span>
          <span className="text-right">WPM</span>
          <span className="text-right">Accuracy</span>
          <span className="text-right">Score</span>
          <span className="text-right">Details</span>
        </div>
        <div className="max-h-[720px] overflow-y-auto">
          {history.map((item) => (
            <div className="grid grid-cols-[1.1fr_90px_90px_90px_90px_1fr] items-center gap-3 border-b border-line px-3 py-3 text-sm last:border-b-0" key={item.id}>
              <span>
                <span className="block font-black">{new Date(item.createdAt).toLocaleDateString()}</span>
                <span className="block text-xs font-semibold text-muted">{new Date(item.createdAt).toLocaleTimeString()}</span>
              </span>
              <span className="font-black">{formatModeLabel(item.mode)}</span>
              <span className="text-right font-mono font-black">{item.wpm}</span>
              <span className="text-right font-mono font-black">{item.accuracy}%</span>
              <span className="text-right font-mono font-black">{item.score}</span>
              <span className="text-right text-xs font-semibold text-muted">
                {item.difficulty.toLowerCase()} · {formatDuration(item.durationSeconds)}
                {item.mode === "CODE" ? ` · ${formatCodeLanguage(item.codeLanguage ?? "CPP")}` : ""}
              </span>
            </div>
          ))}
          {!history.length && (
            <div className="p-6 text-sm font-semibold text-muted">
              No practice history yet. Finish a practice test and it will appear here with its score, mode, difficulty, and date.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DailyChallengeView({
  challenge,
  typed,
  target,
  metrics,
  remaining,
  running,
  inputRef,
  onKeyDown,
  onStart,
  onFinish
}: {
  challenge: DailyChallengeSummary | null;
  typed: string;
  target: string;
  metrics: { wpm: number; accuracy: number; consistency: number; score: number; errors: number };
  remaining: number;
  running: boolean;
  inputRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const leaderboard = challenge?.leaderboard ?? [];
  const showLiveMetrics = running || typed.length > 0;

  return (
    <div className="space-y-4">
      <Panel title="Daily Challenge" icon={<CalendarDays className="h-4 w-4" />}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/75 p-4">
          <div>
            <div className="text-xs font-black uppercase text-muted">Today&apos;s fixed text</div>
            <div className="mt-1 font-mono text-xl font-black">{challenge ? new Date(`${challenge.challengeDate}T00:00:00`).toLocaleDateString() : "Loading..."}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryButton} onClick={onStart}><Play className="h-4 w-4" /> {typed.length ? "Restart Daily" : "Start Daily"}</button>
            <button className={secondaryButton} onClick={onFinish} disabled={!running}><Square className="h-4 w-4" /> Finish</button>
          </div>
        </div>
        {showLiveMetrics ? (
          <div className="mb-4 grid gap-2 md:grid-cols-5">
            <Metric label="WPM" value={String(metrics.wpm)} />
            <Metric label="Accuracy" value={`${metrics.accuracy}%`} />
            <Metric label="Score" value={String(metrics.score)} />
            <Metric label="Errors" value={String(metrics.errors)} />
            <Metric label="Time" value={formatDuration(remaining)} />
          </div>
        ) : challenge?.myEntry ? (
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <Metric label="Best WPM" value={String(challenge.myEntry.wpm)} />
            <Metric label="Accuracy" value={`${challenge.myEntry.accuracy}%`} />
            <Metric label="Score" value={String(challenge.myEntry.score)} />
            <Metric label="Ranked Runs" value={String(leaderboard.length)} />
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-line bg-surface/75 p-4 text-sm font-semibold text-muted">
            Everyone gets the same 60-second challenge today. Your best score is saved on the daily leaderboard.
          </div>
        )}
        <TypingText
          ref={inputRef}
          prompt={target}
          typed={typed}
          code={false}
          focusIndex={typed.length}
          active={running}
          onKeyDown={onKeyDown}
        />
      </Panel>

      <Panel title={"Today's Leaderboard"} icon={<Trophy className="h-4 w-4" />}>
        <div className="overflow-hidden rounded-lg border border-line bg-surface/65">
          <div className="grid grid-cols-[54px_1fr_80px_90px_80px] gap-3 border-b border-line bg-panel/75 px-3 py-2 text-[11px] font-black uppercase text-muted">
            <span>Rank</span>
            <span>User</span>
            <span className="text-right">WPM</span>
            <span className="text-right">Score</span>
            <span className="text-right">Errors</span>
          </div>
          {leaderboard.map((entry, index) => (
            <div className="grid grid-cols-[54px_1fr_80px_90px_80px] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0" key={entry.userId}>
              <span className="font-mono text-lg font-black">#{index + 1}</span>
              <span>
                <span className="block font-black">{entry.username}</span>
                <span className="block text-xs font-semibold text-muted">{entry.level} · {entry.accuracy}% accuracy</span>
              </span>
              <span className="text-right font-mono font-black">{entry.wpm}</span>
              <span className="text-right font-mono font-black">{entry.score}</span>
              <span className="text-right font-mono font-black">{entry.errors}</span>
            </div>
          ))}
          {!leaderboard.length && (
            <div className="p-6 text-sm font-semibold text-muted">No daily runs yet. Be the first one on today&apos;s board.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ProfileView({ profile, currentUserId, analytics }: { profile: LeaderboardUser | null; currentUserId: string; analytics: AnalyticsSummary }) {
  return (
    <div className="space-y-4">
    <Panel title={profile?.id === currentUserId ? "My Profile" : "User Profile"} icon={<Users className="h-4 w-4" />}>
      {profile ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-lg border border-line bg-surface/75 p-5">
            <div className="text-3xl font-black">{profile.username}</div>
            <div className="mt-1 text-sm font-semibold text-muted">{profile.level} · joined {new Date(profile.joinedAt).toLocaleDateString()}</div>
            <div className="mt-5 rounded-lg border border-line bg-panel/80 p-4">
              <div className="text-xs font-black uppercase text-muted">Current Rating</div>
              <div className="mt-1 font-mono text-5xl font-black text-mint">{profile.rating}</div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Best WPM" value={String(profile.bestWpm)} />
            <Metric label="Avg WPM" value={String(profile.averageWpm)} />
            <Metric label="Accuracy" value={`${profile.averageAccuracy}%`} />
            <Metric label="Consistency" value={`${profile.consistency}%`} />
            <Metric label="Races Done" value={String(profile.racesDone)} />
            <Metric label="Practice Tests" value={String(profile.practiceTestsDone)} />
            <Metric label="Typing Time" value={formatTypingTime(profile.totalTypingSeconds)} />
            <Metric label="Wins" value={String(profile.wins)} />
            <Metric label="Podiums" value={String(profile.podiums)} />
            <Metric label="All Tests" value={String(profile.practiceTestsDone + profile.racesDone)} />
          </div>
        </div>
      ) : (
        <p className="text-sm font-semibold text-muted">Loading profile...</p>
      )}
    </Panel>
    <Panel title="Analytics" icon={<BarChart3 className="h-4 w-4" />}>
      <div className="grid gap-2 md:grid-cols-2">
        <Metric label="Consistency" value={`${analytics.consistency}%`} />
        <Metric label="Races" value={String(analytics.recentRaces.length)} />
      </div>
      <MiniChart points={analytics.wpmTrend.map((item) => item.wpm)} color="#2f8f83" label="WPM trend" />
      <MiniChart points={analytics.ratingHistory.map((item) => item.rating)} color="#4169a8" label="Rating history" />
    </Panel>
    <Panel title="Achievements" icon={<Award className="h-4 w-4" />}>
      {profile?.achievements.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profile.achievements.map((achievement) => (
            <div className="rounded-lg border border-line bg-surface/75 p-4 shadow-sm" key={achievement.code}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full border border-line bg-panel/80 px-2.5 py-1 text-[10px] font-black uppercase text-muted">{achievement.category}</span>
                <Award className="h-4 w-4 text-brass" />
              </div>
              <div className="text-base font-black">{achievement.title}</div>
              <div className="mt-1 text-sm font-medium text-muted">{achievement.description}</div>
              <div className="mt-3 text-[11px] font-bold uppercase text-muted">Earned {new Date(achievement.earnedAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-surface/55 p-6 text-sm font-semibold text-muted">
          Finish practice tests to unlock badges for speed, accuracy, consistency, clean runs, daily challenges, and streak-like progress.
        </div>
      )}
    </Panel>
    <Panel title="Weak Spots" icon={<Activity className="h-4 w-4" />}>
      <KeyboardHeatmap letters={analytics.weakLetters} />
    </Panel>
    </div>
  );
}

const TypingText = React.forwardRef<HTMLDivElement, {
  prompt: string;
  typed: string;
  code: boolean;
  focusIndex?: number;
  active?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}>(function TypingText({ prompt, typed, code, focusIndex = 0, active = false, onKeyDown }, ref) {
  const safePrompt = prompt ?? "";
  const windowStart = focusIndex > 260 ? Math.max(0, focusIndex - 160) : 0;
  const windowEnd = Math.min(safePrompt.length, Math.max(900, focusIndex + 740));
  const visiblePrompt = safePrompt.slice(windowStart, windowEnd);
  return (
    <div
      ref={ref}
      className={`type-text min-h-[560px] cursor-text rounded-lg border border-line bg-surface/90 p-9 text-4xl leading-[4.1rem] shadow-glow outline-none ring-mint/30 backdrop-blur-xl transition focus:ring-4 ${code ? "font-mono text-2xl leading-[3.15rem]" : "font-sans"} ${active ? "border-mint" : ""}`}
      role="textbox"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPaste={(event) => event.preventDefault()}
      onClick={(event) => active && event.currentTarget.focus()}
    >
      {visiblePrompt ? visiblePrompt.split("").map((char, visibleIndex) => {
        const index = windowStart + visibleIndex;
        const state = index < typed.length ? (typed[index] === char ? "done" : "wrong") : index === typed.length ? "current" : "";
        return <span className={state} key={`${char}-${index}`}>{char}</span>;
      }) : <span className="text-muted">Choose a practice format and start typing.</span>}
    </div>
  );
});

function MiniChart({ points, color, label }: { points: number[]; color: string; label: string }) {
  if (points.length < 3) {
    return (
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted"><Gauge className="h-3 w-3" /> {label}</div>
        <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface/55 px-4 text-center text-xs font-bold uppercase text-muted">
          Finish 3 tests to unlock trend.
        </div>
      </div>
    );
  }
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  const path = points.map((point, index) => {
    const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100;
    const y = 90 - ((point - min) / range) * 75;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted"><Gauge className="h-3 w-3" /> {label}</div>
      <svg className="h-24 w-full rounded-lg border border-line bg-surface/70" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function KeyboardHeatmap({ letters }: { letters: { token: string; mistakes: number; attempts: number }[] }) {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const stats = new Map(letters.map((item) => [item.token.toLowerCase(), item]));
  const maxMistakes = Math.max(...letters.map((item) => item.mistakes), 1);

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase text-muted">Keyboard Error Heatmap</h3>
        <span className="text-[10px] font-bold uppercase text-muted">Darker = more mistakes</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((row, rowIndex) => (
          <div className={`flex gap-1.5 ${rowIndex === 1 ? "pl-4" : rowIndex === 2 ? "pl-10" : ""}`} key={row}>
            {row.split("").map((letter) => {
              const item = stats.get(letter);
              const intensity = item ? Math.min(1, item.mistakes / maxMistakes) : 0;
              const background = item ? `rgba(217, 101, 79, ${0.18 + intensity * 0.72})` : "rgb(var(--color-panel) / 0.86)";
              const color = intensity > 0.58 ? "white" : "rgb(var(--color-ink))";
              const title = item ? `${letter.toUpperCase()}: ${item.mistakes} mistakes in ${item.attempts} attempts` : `${letter.toUpperCase()}: no mistakes yet`;
              return (
                <div
                  className="flex aspect-square min-w-0 flex-1 items-center justify-center rounded border border-line font-mono text-sm font-black shadow-sm"
                  key={letter}
                  style={{ background, color }}
                  title={title}
                >
                  {letter.toUpperCase()}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!letters.length && <div className="mt-3 text-xs font-medium text-muted">Finish a practice session or race with a few mistakes to light this up.</div>}
    </div>
  );
}

function TokenList({ title, items }: { title: string; items: { token: string; mistakes: number; attempts: number }[] }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.length ? items.map((item) => (
          <span className="rounded border border-line bg-surface/75 px-2 py-1 font-mono text-xs" key={`${title}-${item.token}`}>{item.token} · {item.mistakes}/{item.attempts}</span>
        )) : <span className="text-sm text-muted">No weak spots yet.</span>}
      </div>
    </div>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  return response.json();
}

function normalizeAnalytics(value: Partial<AnalyticsSummary> | null | undefined): AnalyticsSummary {
  return {
    wpmTrend: Array.isArray(value?.wpmTrend) ? value.wpmTrend : [],
    accuracyTrend: Array.isArray(value?.accuracyTrend) ? value.accuracyTrend : [],
    ratingHistory: Array.isArray(value?.ratingHistory) ? value.ratingHistory : [],
    weakLetters: Array.isArray(value?.weakLetters) ? value.weakLetters : [],
    weakWords: Array.isArray(value?.weakWords) ? value.weakWords : [],
    consistency: typeof value?.consistency === "number" ? value.consistency : 100,
    recentRaces: Array.isArray(value?.recentRaces) ? value.recentRaces : []
  };
}

function tab(active: boolean) {
  return `flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${active ? "border-ink bg-ink text-panel shadow-soft" : "border-line bg-surface/75 hover:bg-surface"}`;
}

function controlButton(active: boolean, disabled = false) {
  const base = active ? activeControl : secondaryButton;
  return `${base} ${disabled ? "cursor-not-allowed opacity-60 hover:shadow-none hover:brightness-100" : ""}`;
}

const practiceModes: { value: PracticeMode; label: string; icon: React.ReactNode }[] = [
  { value: "WORDS", label: "Words", icon: <WholeWord className="h-4 w-4" /> },
  { value: "VOCAB", label: "Vocab", icon: <BookOpen className="h-4 w-4" /> },
  { value: "STORY", label: "Story", icon: <Keyboard className="h-4 w-4" /> },
  { value: "QUOTE", label: "Quote", icon: <Quote className="h-4 w-4" /> },
  { value: "CODE", label: "Code", icon: <Braces className="h-4 w-4" /> },
  { value: "ADAPTIVE", label: "Adaptive", icon: <Target className="h-4 w-4" /> }
];

const practiceDifficulties: { value: PracticeDifficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
  { value: "EXPERT", label: "Expert" }
];

const codeLanguages: { value: CodeLanguage; label: string }[] = [
  { value: "CPP", label: "C++" },
  { value: "JAVASCRIPT", label: "JavaScript" },
  { value: "PYTHON", label: "Python" },
  { value: "JAVA", label: "Java" },
  { value: "SQL", label: "SQL" }
];

const minuteOptions = Array.from({ length: 16 }, (_, index) => index);
const secondOptions = Array.from({ length: 60 }, (_, index) => index);
const raceTimeOptions = Array.from({ length: 14 }, (_, index) => (index + 2) * 60);

const easyWords = [
  "about", "above", "again", "always", "answer", "around", "basic", "before", "better", "bright", "camera", "chance", "change", "choice",
  "circle", "common", "course", "create", "during", "effect", "effort", "energy", "family", "faster", "finish", "follow", "format", "friend",
  "future", "garden", "ground", "handle", "happen", "inside", "island", "leader", "letter", "little", "market", "memory", "method", "minute",
  "modern", "moment", "motion", "notice", "office", "option", "period", "person", "phrase", "planet", "player", "public", "quality", "random",
  "rating", "reason", "record", "render", "repair", "repeat", "report", "result", "rhythm", "screen", "second", "select", "service", "signal",
  "simple", "smooth", "stable", "steady", "stream", "system", "target", "thread", "timing", "typing", "useful", "value", "window", "winner"
];

const commonWords = [
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

const expertTypingWords = [
  "access", "account", "actually", "address", "already", "although", "another", "because", "believe", "business", "calendar", "carefully",
  "challenge", "comfortable", "committee", "communication", "community", "complete", "condition", "connection", "consider", "continue",
  "different", "difficult", "direction", "education", "especially", "everything", "experience", "favorite", "February", "government",
  "guarantee", "important", "including", "information", "interesting", "language", "necessary", "occasionally", "opportunity", "original",
  "particular", "personal", "possible", "probably", "professional", "question", "receive", "remember", "restaurant", "schedule", "separate",
  "similar", "sincerely", "successful", "surprise", "temperature", "together", "tomorrow", "usually", "wednesday", "wonderful"
];

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

const clientCodeSnippets: Record<CodeLanguage, string[]> = {
  CPP: [
    "#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    vector<int> a = {5, 2, 8, 1};\n    for (int x : a) cout << x << ' ';\n    return 0;\n}",
    "int gcd(int a, int b) {\n    while (b != 0) {\n        int r = a % b;\n        a = b;\n        b = r;\n    }\n    return a;\n}",
    "vector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int, int> seen;\n    for (int i = 0; i < nums.size(); ++i) {\n        int need = target - nums[i];\n        if (seen.count(need)) return {seen[need], i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}",
    "queue<int> q;\nq.push(1);\nq.push(2);\nwhile (!q.empty()) {\n    cout << q.front() << '\\n';\n    q.pop();\n}"
  ],
  JAVASCRIPT: [
    "const sorted = users\n  .filter((user) => user.rating >= 0)\n  .sort((a, b) => b.rating - a.rating);",
    "function clamp(value, min, max) {\n  return Math.max(min, Math.min(max, value));\n}",
    "async function postResult(result) {\n  const response = await fetch('/api/practice/result', {\n    method: 'POST',\n    body: JSON.stringify(result)\n  });\n  return response.json();\n}"
  ],
  PYTHON: [
    "def clamp(value, minimum, maximum):\n    return max(minimum, min(maximum, value))",
    "scores = sorted(players, key=lambda player: player['wpm'], reverse=True)\nfor index, player in enumerate(scores, start=1):\n    print(index, player['username'])",
    "def accuracy(total, errors):\n    if total == 0:\n        return 100\n    return round(((total - errors) / total) * 100, 2)"
  ],
  JAVA: [
    "static int clamp(int value, int min, int max) {\n    return Math.max(min, Math.min(max, value));\n}",
    "List<Player> ranked = players.stream()\n    .sorted(Comparator.comparingInt(Player::wpm).reversed())\n    .toList();",
    "for (int i = 0; i < values.length; i++) {\n    total += values[i];\n    prefix[i + 1] = total;\n}"
  ],
  SQL: [
    "SELECT username, rating\nFROM \"User\"\nORDER BY rating DESC, username ASC\nLIMIT 10;",
    "UPDATE \"User\"\nSET rating = GREATEST(0, rating + $1)\nWHERE id = $2;",
    "SELECT mode, difficulty, AVG(wpm) AS average_wpm\nFROM \"PracticeSession\"\nGROUP BY mode, difficulty\nORDER BY average_wpm DESC;"
  ]
};

function makePracticeChunk(mode: PracticeMode, difficulty: PracticeDifficulty, codeLanguage: CodeLanguage) {
  if (mode === "CODE") {
    return { text: randomFrom(clientCodeSnippets[codeLanguage]), vocabulary: [] };
  }
  if (mode === "QUOTE") {
    return { text: randomFrom([
      "It always seems impossible until it is done.",
      "The secret of getting ahead is getting started.",
      "Well done is better than well said.",
      "Quality is not an act, it is a habit.",
      "Do what you can, with what you have, where you are.",
      "The journey of a thousand miles begins with one step.",
      "Simplicity is the ultimate sophistication.",
      "Whether you think you can or you think you cannot, you are right."
    ]), vocabulary: [] };
  }
  if (mode === "STORY") {
    return { text: randomFrom([
      "The cursor moved across the line while every word asked for a little more patience. A clean rhythm appeared when the typist stopped chasing the clock.",
      "The project looked complicated from far away, but each sentence made it smaller. One clear thought became the next, and soon the whole problem had edges.",
      "Morning light crossed the desk as the keys settled into a steady rhythm. The goal was not to rush, but to keep moving with enough calm to notice every mistake.",
      "A quiet room can make progress sound louder. The typist followed the line, fixed the errors, and found that consistency was patience repeated at speed."
    ]), vocabulary: [] };
  }
  if (mode === "VOCAB") {
    const vocabulary = pickVocabulary(difficulty, 18);
    return { text: vocabulary.map((entry) => entry.example).join(" "), vocabulary };
  }
  const words = randomWords(160, difficulty);
  return { text: words.join(" "), vocabulary: [] };
}

function randomWords(count: number, difficulty: PracticeDifficulty) {
  const source = difficulty === "EXPERT" ? expertTypingWords : difficulty === "HARD" ? commonWords.concat(hardWords) : difficulty === "EASY" ? easyWords : commonWords;
  return Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]);
}

function randomFrom(values: string[]) {
  return values[Math.floor(Math.random() * values.length)];
}

function normalizePracticeDuration(duration: number) {
  if (!Number.isFinite(duration)) return 60;
  return Math.max(1, Math.min(900, Math.floor(duration)));
}

function formatDuration(totalSeconds: number) {
  const duration = normalizePracticeDuration(totalSeconds);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTypingTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatModeLabel(mode: PracticeMode) {
  return mode === "STORY" ? "Story" : mode === "QUOTE" ? "Quote" : mode === "CODE" ? "Code" : mode === "WORDS" ? "Words" : mode === "ADAPTIVE" ? "Adaptive" : "Vocab";
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function textModeForPracticeMode(mode: PracticeMode): TextMode {
  if (mode === "CODE") return "CODE";
  if (mode === "QUOTE") return "QUOTE";
  return "PROSE";
}

function formatCodeLanguage(language: CodeLanguage) {
  return codeLanguages.find((item) => item.value === language)?.label ?? "C++";
}

function shouldIgnoreShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea" || target.isContentEditable;
}

function pickVocabulary(difficulty: PracticeDifficulty, count: number) {
  const source = difficulty === "EXPERT" ? vocabularyBank : difficulty === "HARD" ? vocabularyBank.filter((entry) => entry.level !== "EASY") : vocabularyBank.filter((entry) => entry.level !== "EXPERT");
  return shuffle(source).slice(0, count).map(({ level: _level, ...entry }) => entry);
}

function mergeVocabulary(current: VocabularyEntry[], next: VocabularyEntry[]) {
  const map = new Map(current.map((entry) => [entry.word, entry]));
  next.forEach((entry) => map.set(entry.word, entry));
  return Array.from(map.values());
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

const field = "mb-3 w-full rounded-lg border border-line bg-surface/85 px-3 py-2 outline-none ring-mint/30 transition focus:ring-4";
const timerSelect = "mt-1 h-44 w-full overflow-y-auto rounded-lg border border-line bg-panel/90 px-2 py-2 text-ink shadow-inner outline-none ring-mint/30 transition focus:ring-4";
const primaryButton = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-mint bg-mint px-3 py-2 font-bold text-white shadow-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100";
const secondaryButton = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface/75 px-3 py-2 font-bold transition hover:bg-surface hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface/75 disabled:hover:shadow-none";
const activeControl = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-mint bg-mint px-3 py-2 font-bold text-white shadow-glow";
const compactButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface/75 px-4 py-2 font-bold transition hover:bg-surface hover:shadow-soft";
const activeCompactButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-mint bg-mint px-4 py-2 font-bold text-white shadow-glow";
const iconButton = "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface/75 transition hover:bg-surface hover:shadow-soft";
const kbdClass = "mx-1 inline-flex min-w-9 items-center justify-center rounded border border-line bg-panel/90 px-2 py-1 font-mono text-xs font-black text-ink shadow-sm";
