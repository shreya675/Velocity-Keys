"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Activity, Award, BarChart3, BookOpen, Braces, CalendarDays, Check, Copy, Eye, Flag, Gauge, History, Keyboard, Link as LinkIcon, Lock, LogIn, LogOut, Moon, Palette, Play, Plus, Quote, Radar, Settings, Sparkles, Square, Sun, Target, Timer, Trash2, Trophy, UserPlus, Users, WholeWord, X } from "lucide-react";
import { calculateAccuracy, calculateConsistency, calculateWpm, levelForRating, practiceScore } from "@/lib/race-math";
import type { AnalyticsSummary, ClientUser, CodeLanguage, DailyChallengeSummary, FriendRequestSummary, FriendsSummary, KeystrokePayload, LeaderboardSummary, LeaderboardUser, PracticeDifficulty, PracticeHistoryItem, PracticeMode, PracticeResult, PublicRoomSummary, RaceSnapshot, TextMode, VocabularyEntry } from "@/lib/types";

type AuthMode = "login" | "register";
type ApiResult<T> = T & { error?: string };
type ActiveView = "practice" | "race" | "daily" | "friends" | "leaderboard" | "history" | "profile" | "settings" | "help";
type Theme = "light" | "dark";
type ThemeShade = "mint" | "ocean" | "violet" | "rose" | "amber" | "forest" | "slate" | "crimson" | "indigo" | "lime" | "cyan" | "orchid";
type ErrorLockMode = "off" | "word" | "letter";
type LeaderboardScope = "public" | "friends";
type ToastTone = "info" | "success" | "error";
type ToastMessage = { id: number; message: string; tone: ToastTone };

export default function Home() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<ClientUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeShade, setThemeShade] = useState<ThemeShade>("mint");
  const [quietMistakes, setQuietMistakes] = useState(false);
  const [errorLockMode, setErrorLockMode] = useState<ErrorLockMode>("off");
  const [paceTargetEnabled, setPaceTargetEnabled] = useState(false);
  const [paceTarget, setPaceTarget] = useState(60);
  const [autoFocusTyping, setAutoFocusTyping] = useState(true);
  const [finishEffects, setFinishEffects] = useState(true);
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
  const [myProfile, setMyProfile] = useState<LeaderboardUser | null>(null);
  const [friends, setFriends] = useState<FriendsSummary | null>(null);
  const [friendNoticeCount, setFriendNoticeCount] = useState(0);
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
  const [deleteAccountConfirming, setDeleteAccountConfirming] = useState(false);
  const [deleteAccountText, setDeleteAccountText] = useState("");
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
    const savedShade = localStorage.getItem("vk_theme_shade");
    const savedErrorLock = localStorage.getItem("vk_error_lock");
    const savedPaceTarget = Number(localStorage.getItem("vk_pace_target") ?? 60);
    const inviteCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
    if (savedToken) setToken(savedToken);
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (isThemeShade(savedShade)) setThemeShade(savedShade);
    setQuietMistakes(localStorage.getItem("vk_quiet_mistakes") === "1");
    if (isErrorLockMode(savedErrorLock)) setErrorLockMode(savedErrorLock);
    setPaceTargetEnabled(localStorage.getItem("vk_pace_target_enabled") === "1");
    if (Number.isFinite(savedPaceTarget)) setPaceTarget(clampNumber(savedPaceTarget, 10, 250));
    setAutoFocusTyping(localStorage.getItem("vk_auto_focus") !== "0");
    setFinishEffects(localStorage.getItem("vk_finish_effects") !== "0");
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
    document.documentElement.dataset.accent = themeShade;
    localStorage.setItem("vk_theme_shade", themeShade);
  }, [themeShade]);

  useEffect(() => {
    localStorage.setItem("vk_quiet_mistakes", quietMistakes ? "1" : "0");
  }, [quietMistakes]);

  useEffect(() => {
    localStorage.setItem("vk_error_lock", errorLockMode);
  }, [errorLockMode]);

  useEffect(() => {
    localStorage.setItem("vk_pace_target_enabled", paceTargetEnabled ? "1" : "0");
    localStorage.setItem("vk_pace_target", String(paceTarget));
  }, [paceTargetEnabled, paceTarget]);

  useEffect(() => {
    localStorage.setItem("vk_auto_focus", autoFocusTyping ? "1" : "0");
  }, [autoFocusTyping]);

  useEffect(() => {
    localStorage.setItem("vk_finish_effects", finishEffects ? "1" : "0");
  }, [finishEffects]);

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
        if (autoFocusTyping) inputRef.current?.focus();
      }
      if (nextSnapshot.status === "FINISHED" && finishEffects) {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 1800);
      }
    });
    nextSocket.on("friend:request", (request: FriendRequestSummary) => {
      setFriends((current) => {
        if (!current) return current;
        if (current.incoming.some((item) => item.id === request.id)) return current;
        return { ...current, incoming: [request, ...current.incoming] };
      });
      setFriendNoticeCount((count) => count + 1);
      showToast(`${request.requester.username} sent you a friend request.`, "info");
    });
    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [autoFocusTyping, finishEffects, showToast, token]);

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
  const roomTitle = snapshot?.isDuel ? `Quick Duel ${snapshot.roomCode}` : snapshot ? `${snapshot.isPrivate ? "Private" : "Public"} Room ${snapshot.roomCode}` : "Race Track";
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

  const loadMyProfile = useCallback(async () => {
    if (!token) return;
    const result = await api<ApiResult<{ user: LeaderboardUser }>>("/api/profile/me", { headers: authHeaders });
    if (result.error) return;
    setMyProfile(result.user);
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
    void loadPracticeHistory();
    void loadMyProfile();
  }, [loadAnalytics, loadMyProfile, loadPracticeHistory]);

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
      showToast("Finding a 1v1 duel near your rating.");
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

  const logout = () => {
    socket?.disconnect();
    setToken("");
    setUser(null);
    setSnapshot(null);
    setMyProfile(null);
    setProfileUser(null);
    setTyped("");
    localStorage.removeItem("vk_token");
    localStorage.removeItem("vk_user");
    showToast("Logged out.", "success");
  };

  const deleteAccount = async () => {
    if (deleteAccountText !== "DELETE") {
      showToast("Type DELETE to confirm account deletion.", "error");
      return;
    }
    const result = await api<ApiResult<{ ok: boolean }>>("/api/account", {
      method: "DELETE",
      headers: authHeaders
    });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    socket?.disconnect();
    setToken("");
    setUser(null);
    setSnapshot(null);
    setMyProfile(null);
    setProfileUser(null);
    setTyped("");
    setDeleteAccountConfirming(false);
    setDeleteAccountText("");
    localStorage.removeItem("vk_token");
    localStorage.removeItem("vk_user");
    showToast("Account deleted.", "success");
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
    if (autoFocusTyping) inputRef.current?.focus();
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
    if (autoFocusTyping) inputRef.current?.focus();
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
    if (finishEffects && result.score >= 900 && result.accuracy >= 90) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 3200);
    }
    if (user) {
      const nextUser = { ...user, rating: result.ratingAfter };
      setUser(nextUser);
      localStorage.setItem("vk_user", JSON.stringify(nextUser));
    }
    void loadAnalytics();
    void loadPracticeHistory();
    void loadMyProfile();
  }, [authHeaders, finishEffects, isPracticeRunning, loadAnalytics, loadMyProfile, loadPracticeHistory, practiceDifficulty, practiceDuration, practiceEvents, practiceMetrics.accuracy, practiceMetrics.consistency, practiceMetrics.errors, practiceMetrics.wpm, practiceMode, practicePrompt, practiceSaved, showToast, user, vocabularyEntries]);

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
    if (finishEffects && dailyMetrics.score >= 900 && dailyMetrics.accuracy >= 90) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 3200);
    }
    void loadMyProfile();
  }, [authHeaders, dailyChallenge, dailyMetrics.accuracy, dailyMetrics.consistency, dailyMetrics.errors, dailyMetrics.score, dailyMetrics.wpm, dailySaved, finishEffects, isDailyRunning, loadMyProfile, showToast]);

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
    const isCodeTyping = canTypeRace ? snapshot?.raceMode === "CODE" : canTypePractice && practiceMode === "CODE";
    if (event.key === "Enter" && isCodeTyping) {
      event.preventDefault();
      if (shouldBlockTyping(errorLockMode, typed, target, "\n")) return;
      const next = `${typed}\n`;
      snapshot ? onTyping(next) : canTypeDaily ? onDailyTyping(next) : onPracticeTyping(next);
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      if (shouldBlockTyping(errorLockMode, typed, target, event.key)) return;
      const next = `${typed}${event.key}`;
      snapshot ? onTyping(next) : canTypeDaily ? onDailyTyping(next) : onPracticeTyping(next);
    }
  };

  if (!user) {
    return (
      <main className="auth-stage min-h-screen overflow-hidden px-5 py-7 text-ink">
        <ToastStack toasts={toasts} />
        <section className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="auth-copy max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="auth-brand inline-flex items-center gap-2 rounded-lg border border-line bg-surface/85 px-3 py-2 text-sm font-black uppercase shadow-soft backdrop-blur">
                <Keyboard className="h-4 w-4 text-mint" /> Velocity Keys
              </div>
              <button className={compactButton} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {theme === "light" ? "Dark" : "Light"}
              </button>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-xs font-black uppercase text-mint">
              <Sparkles className="h-3.5 w-3.5" /> Built for focused typing practice
            </div>
            <h1 className="auth-headline max-w-3xl text-5xl font-black leading-[1.02] tracking-normal md:text-7xl">
              Type cleaner. Climb higher.
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-muted">
              Practice with timed drills, race friends in private rooms, and track the progress that actually matters: speed, accuracy, consistency, and rating.
            </p>
            <div className="typing-showcase mt-7 max-w-2xl rounded-lg border border-line bg-panel/75 p-4 shadow-soft backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black uppercase text-muted">
                <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-mint" /> Live typing flow</span>
                <span className="font-mono text-mint">64 WPM</span>
              </div>
              <div className="typing-line font-mono text-xl font-black leading-9 md:text-2xl">
                <span>steady rhythm rewards </span><span className="text-mint">clean accuracy</span><span> and calm corrections</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                <div className="auth-progress h-full rounded-full bg-mint" />
              </div>
            </div>
          </div>
          <div className="auth-card glass-panel rounded-lg border border-line bg-panel/95 p-5 pt-6 shadow-glow backdrop-blur-xl">
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/75 px-3 py-1 text-xs font-black uppercase text-muted">
                <Check className="h-3.5 w-3.5 text-mint" /> Ready to race
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
            <div className="mt-4 grid grid-cols-8 gap-2">
              {"ASDFJKL;".split("").map((key, index) => (
                <div className="login-key rounded-md border border-line bg-surface/75 py-2 text-center font-mono text-xs font-black shadow-soft" key={key} style={{ animationDelay: `${index * 90}ms` }}>
                  {key}
                </div>
              ))}
            </div>
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
      {snapshot?.status === "COUNTDOWN" && <RaceCountdownOverlay countdown={countdown} />}
      <header className="glass-panel mx-auto mb-6 flex max-w-[1500px] flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-panel/80 px-5 py-5 shadow-soft backdrop-blur-xl">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-black uppercase text-muted">
            <Sparkles className="h-3.5 w-3.5 text-brass" /> Real-time Typing Arena
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black md:text-5xl">Velocity Keys</h1>
          </div>
          <p className="mt-1 text-base font-semibold text-muted md:text-lg">{user.username} · {user.rating} ELO · {levelForRating(user.rating)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={activeView === "practice" ? activeCompactButton : compactButton} onClick={() => { setActiveView("practice"); void loadPractice(); }}><Target className="h-4 w-4" /> Practice</button>
          <button className={activeView === "race" ? activeCompactButton : compactButton} onClick={() => setActiveView("race")}><Users className="h-4 w-4" /> Race</button>
          <button className={activeView === "daily" ? activeCompactButton : compactButton} onClick={() => { setActiveView("daily"); void loadDailyChallenge(); }}><CalendarDays className="h-4 w-4" /> Daily</button>
          <button
            className={`relative ${activeView === "friends" ? activeCompactButton : compactButton}`}
            onClick={() => {
              setActiveView("friends");
              setFriendNoticeCount(0);
              void loadFriends();
            }}
          >
            <UserPlus className="h-4 w-4" /> Friends
            {friendNoticeCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-panel bg-coral px-1 font-mono text-[10px] font-black text-white">
                {friendNoticeCount > 9 ? "9+" : friendNoticeCount}
              </span>
            )}
          </button>
          <button className={activeView === "leaderboard" ? activeCompactButton : compactButton} onClick={() => setActiveView("leaderboard")}><Trophy className="h-4 w-4" /> Leaderboard</button>
          <button className={activeView === "history" ? activeCompactButton : compactButton} onClick={() => { setActiveView("history"); void loadPracticeHistory(); }}><History className="h-4 w-4" /> History</button>
          <button className={activeView === "profile" ? activeCompactButton : compactButton} onClick={() => { setActiveView("profile"); void loadProfile(); }}><Users className="h-4 w-4" /> Profile</button>
          <button className={activeView === "settings" ? activeCompactButton : compactButton} onClick={() => setActiveView("settings")}><Settings className="h-4 w-4" /> Settings</button>
          <button className={activeView === "help" ? activeCompactButton : compactButton} onClick={() => setActiveView("help")}><BookOpen className="h-4 w-4" /> How To Use</button>
        </div>
      </header>

      <section className={`mx-auto grid max-w-[1500px] gap-4 ${activeView === "leaderboard" || activeView === "history" || activeView === "settings" || activeView === "help" || activeView === "friends" || activeView === "daily" || activeView === "profile" ? "" : "xl:grid-cols-[minmax(0,1fr)_380px]"}`}>
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
              quietMistakes={quietMistakes}
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
            <HistoryView history={practiceHistory} />
          ) : activeView === "settings" ? (
            <SettingsView
              theme={theme}
              themeShade={themeShade}
              quietMistakes={quietMistakes}
              errorLockMode={errorLockMode}
              paceTargetEnabled={paceTargetEnabled}
              paceTarget={paceTarget}
              autoFocusTyping={autoFocusTyping}
              finishEffects={finishEffects}
              deleteAccountConfirming={deleteAccountConfirming}
              deleteAccountText={deleteAccountText}
              onThemeChange={setTheme}
              onThemeShadeChange={setThemeShade}
              onQuietMistakesChange={setQuietMistakes}
              onErrorLockModeChange={setErrorLockMode}
              onPaceTargetEnabledChange={setPaceTargetEnabled}
              onPaceTargetChange={(value) => setPaceTarget(clampNumber(value, 10, 250))}
              onAutoFocusTypingChange={setAutoFocusTyping}
              onFinishEffectsChange={setFinishEffects}
              onLogout={logout}
              onStartDelete={() => setDeleteAccountConfirming(true)}
              onCancelDelete={() => {
                setDeleteAccountConfirming(false);
                setDeleteAccountText("");
              }}
              onDeleteTextChange={setDeleteAccountText}
              onDeleteAccount={deleteAccount}
            />
          ) : activeView === "help" ? (
            <HowToUseView />
          ) : (
            <>
          <Panel title={activeView === "race" ? roomTitle : "Practice Track"} icon={<Keyboard className="h-4 w-4" />}>
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
              quietMistakes={quietMistakes}
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

            </>
          )}
        </section>

        {activeView !== "leaderboard" && activeView !== "history" && activeView !== "settings" && activeView !== "help" && activeView !== "friends" && activeView !== "daily" && activeView !== "profile" && <aside className="space-y-4">
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
                    {snapshot?.isDuel ? "Quick Duel is locked to the two matched racers." : "Room settings are locked until this race ends."}
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
                {snapshot?.roomCode && !snapshot.isDuel ? (
                  <div className="my-3 rounded-lg border border-line bg-surface/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-muted">
                      <LinkIcon className="h-3.5 w-3.5" /> Room invite link
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <input
                        className="w-full rounded-lg border border-line bg-panel/85 px-3 py-2 font-mono text-xs outline-none"
                        readOnly
                        value={appOrigin ? `${appOrigin}?room=${snapshot.roomCode}` : `?room=${snapshot.roomCode}`}
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
                <button className={primaryButton} disabled={raceSettingsLocked} onClick={matchmake}><Radar className="h-4 w-4" /> Quick Duel</button>
              </Panel>

            </>
          ) : (
            <Panel title="Settings" icon={<Settings className="h-4 w-4" />}>
              <div className="rounded-lg border border-line bg-surface/70 p-3 text-sm font-medium text-muted">
                Choose your color shade, switch theme, or manage your account from the Settings page.
              </div>
            </Panel>
          )}
          {activeView === "practice" && (
            <ProgressCoach
              analytics={safeAnalytics}
              currentView={activeView}
              dailyChallenge={dailyChallenge}
              friends={friends}
              leaderboard={leaderboard}
              practiceHistory={practiceHistory}
              profile={myProfile}
              showPageTip={false}
              showRecentActivity={false}
              user={user}
              onUseSuggestion={(mode, difficulty, duration) => {
                setActiveView("practice");
                setPracticeMode(mode);
                setPracticeDifficulty(difficulty);
                setPracticeDuration(duration);
                void loadPractice(mode, duration, difficulty, codeLanguage);
              }}
            />
          )}
        </aside>}
      </section>
      {activeView === "race" && (
        <section className="mx-auto mt-4 max-w-[1500px]">
          <Panel title="Leaderboard" icon={<Trophy className="h-4 w-4" />}>
            <RaceRoomLeaderboard snapshot={snapshot} />
          </Panel>
        </section>
      )}
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

function SettingRow({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface/70 p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] md:items-center">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black uppercase text-muted">{icon}{title}</h3>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </section>
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

function RaceRoomLeaderboard({ snapshot }: { snapshot: RaceSnapshot | null }) {
  const players = snapshot?.players ?? [];
  if (!players.length) {
    return <p className="text-sm font-semibold text-muted">Create, join, or start a quick duel to see live opponents.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface/65">
      <div className="grid grid-cols-[64px_1fr_130px_130px_130px] gap-3 border-b border-line bg-panel/75 px-4 py-3 text-[11px] font-black uppercase text-muted">
        <span>Rank</span>
        <span>User</span>
        <span className="text-right">Status</span>
        <span className="text-right">Progress</span>
        <span className="text-right">WPM</span>
      </div>
      {players.map((player, index) => (
        <div key={player.userId} className="grid grid-cols-[64px_1fr_130px_130px_130px] items-center gap-3 border-b border-line px-4 py-4 last:border-b-0">
          <span className="font-mono text-xl font-black">#{index + 1}</span>
          <div>
            <div className="font-black">{player.username}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-mint transition-all duration-500" style={{ width: `${player.progress}%` }} />
            </div>
          </div>
          <span className="text-right text-sm font-black text-muted">{snapshot?.status === "WAITING" ? player.ready ? "Ready" : "Not ready" : `${player.rating} pts`}</span>
          <span className="text-right font-mono font-black">{player.progress}%</span>
          <span className="text-right font-mono font-black">{player.wpm}</span>
        </div>
      ))}
    </div>
  );
}

function RaceCountdownOverlay({ countdown }: { countdown: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink/45 backdrop-blur-sm">
      <div className="race-pop rounded-lg border border-mint bg-panel/95 px-12 py-10 text-center shadow-glow">
        <div className="text-sm font-black uppercase text-muted">Race starts in</div>
        <div className="mt-2 font-mono text-8xl font-black text-mint">{countdown || "Go"}</div>
      </div>
    </div>
  );
}

function FinishCelebration() {
  const pieces = Array.from({ length: 28 }, (_, index) => index);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-ink/35 backdrop-blur-[2px]">
      <div className="race-pop rounded-lg border border-mint bg-panel/95 px-10 py-7 text-center text-ink shadow-glow backdrop-blur-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mint text-white">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="text-3xl font-black">Race complete</div>
        <div className="mt-1 text-sm font-bold uppercase text-muted">Results are ready</div>
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
      <Panel title="Friend System" icon={<UserPlus className="h-4 w-4" />}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Friends" value={String(accepted.length)} />
          <Metric label="Incoming" value={String(incoming.length)} />
          <Metric label="Outgoing" value={String(outgoing.length)} />
          <Metric label="Leaderboard" value="Friends" />
        </div>
        <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-semibold text-muted">
          Send a request by exact username, accept incoming requests, and compare accepted friends from the Friends tab on the leaderboard.
        </div>
      </Panel>

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

function HistoryView({ history }: { history: PracticeHistoryItem[] }) {
  return (
    <div className="space-y-4">
      <HistorySummary history={history} />
      <PracticeHistoryView history={history} />
    </div>
  );
}

function HistorySummary({ history }: { history: PracticeHistoryItem[] }) {
  const bestWpm = Math.max(0, ...history.map((item) => item.wpm));
  const averageWpm = Math.round(avgNumber(history.map((item) => item.wpm)));
  const averageAccuracy = Math.round(avgNumber(history.map((item) => item.accuracy)) * 10) / 10;
  const bestScore = Math.max(0, ...history.map((item) => item.score));
  const totalTime = history.reduce((sum, item) => sum + item.durationSeconds, 0);
  const latest = history[0];

  return (
    <Panel title="History Summary" icon={<History className="h-4 w-4" />}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Tests" value={String(history.length)} />
        <Metric label="Best WPM" value={String(bestWpm)} />
        <Metric label="Avg WPM" value={String(averageWpm)} />
        <Metric label="Accuracy" value={`${averageAccuracy}%`} />
        <Metric label="Best Score" value={String(bestScore)} />
        <Metric label="Time" value={formatTypingTime(totalTime)} />
      </div>
      <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-semibold text-muted">
        {latest
          ? `Latest saved test: ${formatModeLabel(latest.mode)} · ${titleCase(latest.difficulty)} · ${latest.wpm} WPM · ${new Date(latest.createdAt).toLocaleString()}`
          : "Finish a practice test and your saved results will appear here."}
      </div>
    </Panel>
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

function HowToUseView() {
  const guideSections = [
    {
      title: "Start With Practice",
      icon: <Target className="h-4 w-4" />,
      items: [
        "Open Practice, choose a timer, difficulty, and typing format.",
        "Press Start Practice and type directly over the shown text.",
        "WPM, accuracy, score, consistency, and errors are shown after the session ends."
      ]
    },
    {
      title: "Typing Modes",
      icon: <Keyboard className="h-4 w-4" />,
      items: [
        "Words gives continuous random word practice.",
        "Vocab places useful vocabulary inside meaningful sentences and explains the words after the test.",
        "Story, Quote, Code, and Adaptive modes change the kind of text you practice on."
      ]
    },
    {
      title: "Race With Others",
      icon: <Users className="h-4 w-4" />,
      items: [
        "Open Race and choose mode, difficulty, time, and room type before creating a room.",
        "Private rooms support invite links and room codes. Public rooms appear in the public room list.",
        "Everyone in the room must press Ready / Start Race before the countdown begins."
      ]
    },
    {
      title: "Quick Duel",
      icon: <Radar className="h-4 w-4" />,
      items: [
        "Quick Duel searches for one opponent near your rating.",
        "When matched, it creates a locked 1v1 race so random users cannot join.",
        "Race results update ratings from speed, accuracy, consistency, placement, and mistakes."
      ]
    },
    {
      title: "Daily Challenge",
      icon: <CalendarDays className="h-4 w-4" />,
      items: [
        "Daily Challenge uses the same text for everyone on that date.",
        "You can replay it, but your best score is kept for the daily leaderboard.",
        "Use it when you want a fair comparison with other users."
      ]
    },
    {
      title: "Progress Pages",
      icon: <BarChart3 className="h-4 w-4" />,
      items: [
        "Profile shows rating, best WPM, average WPM, accuracy, races, practice tests, wins, and typing time.",
        "Leaderboard has Public and Friends scopes.",
        "History lists every completed practice test with mode, difficulty, score, accuracy, and date."
      ]
    },
    {
      title: "Friends And Spectators",
      icon: <UserPlus className="h-4 w-4" />,
      items: [
        "Send friend requests by exact username from the Friends page.",
        "Accepted friends can be compared in the Friends leaderboard.",
        "Use Watch to join a room as a spectator without racing."
      ]
    },
    {
      title: "Settings",
      icon: <Settings className="h-4 w-4" />,
      items: [
        "Switch light or dark theme and choose a color shade.",
        "Change mistake visibility, correction lock, pace target, auto-focus, and finish animation.",
        "Logout and permanent account deletion are kept in Settings."
      ]
    }
  ];

  return (
    <div className="space-y-4">
      <Panel title="How To Use Velocity Keys" icon={<BookOpen className="h-4 w-4" />}>
        <div className="rounded-lg border border-line bg-surface/75 p-5">
          <div className="max-w-3xl">
            <div className="text-3xl font-black">Everything starts from the top navigation.</div>
            <p className="mt-3 text-base font-semibold leading-7 text-muted">
              Use Practice for solo improvement, Race for live multiplayer, Daily for a shared challenge, and Profile or History to understand your progress.
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric label="Main Flow" value="Practice" />
            <Metric label="Multiplayer" value="Race" />
            <Metric label="Progress" value="Profile" />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {guideSections.map((section) => (
          <Panel title={section.title} icon={section.icon} key={section.title}>
            <div className="space-y-3">
              {section.items.map((item, index) => (
                <div className="grid grid-cols-[32px_1fr] gap-3 rounded-lg border border-line bg-surface/70 p-3" key={item}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint font-mono text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm font-semibold leading-6 text-muted">{item}</p>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ProgressCoach({
  analytics,
  currentView,
  dailyChallenge,
  friends,
  leaderboard,
  practiceHistory,
  profile,
  showPageTip = true,
  showRecentActivity = true,
  user,
  onUseSuggestion
}: {
  analytics: AnalyticsSummary;
  currentView: ActiveView;
  dailyChallenge: DailyChallengeSummary | null;
  friends: FriendsSummary | null;
  leaderboard: LeaderboardSummary | null;
  practiceHistory: PracticeHistoryItem[];
  profile: LeaderboardUser | null;
  showPageTip?: boolean;
  showRecentActivity?: boolean;
  user: ClientUser;
  onUseSuggestion: (mode: PracticeMode, difficulty: PracticeDifficulty, duration: number) => void;
}) {
  const nextAchievement = nextAchievementForProfile(profile);
  const suggestion = practiceSuggestion(analytics, practiceHistory, profile);
  const activities = showRecentActivity ? recentActivities(practiceHistory, analytics) : [];
  const pageHint = showPageTip ? coachHintForView(currentView, { dailyChallenge, friends, leaderboard }) : "";

  return (
    <div className="space-y-4">
      <Panel title="Next Up" icon={<Sparkles className="h-4 w-4" />}>
        <div className="rounded-lg border border-line bg-surface/75 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-muted">Next achievement</div>
              <div className="mt-1 text-lg font-black">{nextAchievement.title}</div>
            </div>
            <Award className="h-5 w-5 text-brass" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-mint transition-all duration-500" style={{ width: `${nextAchievement.percent}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs font-bold uppercase text-muted">
            <span>{nextAchievement.currentLabel}</span>
            <span>{nextAchievement.targetLabel}</span>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-muted">{nextAchievement.description}</p>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-surface/75 p-4">
          <div className="text-xs font-black uppercase text-muted">Suggested practice</div>
          <div className="mt-1 text-lg font-black">{suggestion.title}</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted">{suggestion.reason}</p>
          <button className={`${secondaryButton} mt-3`} onClick={() => onUseSuggestion(suggestion.mode, suggestion.difficulty, suggestion.duration)}>
            <Target className="h-4 w-4" /> Use Suggestion
          </button>
        </div>
      </Panel>

      {showRecentActivity && (
        <Panel title="Recent Activity" icon={<History className="h-4 w-4" />}>
          <div className="space-y-2">
            {activities.map((activity) => (
              <div className="rounded-lg border border-line bg-surface/70 p-3" key={activity.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black">{activity.title}</span>
                  <span className="font-mono text-sm font-black text-mint">{activity.value}</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-muted">{activity.detail}</div>
              </div>
            ))}
            {!activities.length && (
              <div className="rounded-lg border border-dashed border-line bg-surface/55 p-4 text-sm font-semibold text-muted">
                Finish a practice test or race and your recent results will appear here.
              </div>
            )}
          </div>
        </Panel>
      )}

      {showPageTip && (
        <Panel title="Page Tip" icon={<BookOpen className="h-4 w-4" />}>
          <div className="rounded-lg border border-line bg-surface/70 p-3 text-sm font-semibold leading-6 text-muted">
            {pageHint}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="You" value={user.username} />
            <Metric label="Rating" value={String(user.rating)} />
          </div>
        </Panel>
      )}
    </div>
  );
}

function SettingsView({
  theme,
  themeShade,
  quietMistakes,
  errorLockMode,
  paceTargetEnabled,
  paceTarget,
  autoFocusTyping,
  finishEffects,
  deleteAccountConfirming,
  deleteAccountText,
  onThemeChange,
  onThemeShadeChange,
  onQuietMistakesChange,
  onErrorLockModeChange,
  onPaceTargetEnabledChange,
  onPaceTargetChange,
  onAutoFocusTypingChange,
  onFinishEffectsChange,
  onLogout,
  onStartDelete,
  onCancelDelete,
  onDeleteTextChange,
  onDeleteAccount
}: {
  theme: Theme;
  themeShade: ThemeShade;
  quietMistakes: boolean;
  errorLockMode: ErrorLockMode;
  paceTargetEnabled: boolean;
  paceTarget: number;
  autoFocusTyping: boolean;
  finishEffects: boolean;
  deleteAccountConfirming: boolean;
  deleteAccountText: string;
  onThemeChange: (theme: Theme) => void;
  onThemeShadeChange: (shade: ThemeShade) => void;
  onQuietMistakesChange: (enabled: boolean) => void;
  onErrorLockModeChange: (mode: ErrorLockMode) => void;
  onPaceTargetEnabledChange: (enabled: boolean) => void;
  onPaceTargetChange: (value: number) => void;
  onAutoFocusTypingChange: (enabled: boolean) => void;
  onFinishEffectsChange: (enabled: boolean) => void;
  onLogout: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onDeleteTextChange: (value: string) => void;
  onDeleteAccount: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Settings" icon={<Settings className="h-4 w-4" />}>
        <section className="rounded-lg border border-line bg-surface/70 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-muted">
            <Palette className="h-4 w-4" /> Appearance
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button className={controlButton(theme === "light")} onClick={() => onThemeChange("light")}>
              <Sun className="h-4 w-4" /> Light
            </button>
            <button className={controlButton(theme === "dark")} onClick={() => onThemeChange("dark")}>
              <Moon className="h-4 w-4" /> Dark
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {themeShades.map((shade) => (
              <button
                className={controlButton(themeShade === shade.value)}
                key={shade.value}
                onClick={() => onThemeShadeChange(shade.value)}
              >
                <span className="h-4 w-4 rounded-full border border-line" style={{ background: shade.color }} />
                {shade.label}
              </button>
            ))}
          </div>
        </section>
      </Panel>

      <Panel title="Typing Preferences" icon={<Keyboard className="h-4 w-4" />}>
        <div className="space-y-3">
          <SettingRow
            icon={<Eye className="h-4 w-4" />}
            title="Mistake visibility"
            description="Keep wrong letters visually calm when you want to focus on rhythm first."
          >
            <div className="grid grid-cols-2 gap-2">
              <button className={controlButton(!quietMistakes)} onClick={() => onQuietMistakesChange(false)}>Show</button>
              <button className={controlButton(quietMistakes)} onClick={() => onQuietMistakesChange(true)}>Hide</button>
            </div>
          </SettingRow>

          <SettingRow
            icon={<Lock className="h-4 w-4" />}
            title="Correction lock"
            description="Choose how strongly the app should stop you when a mistake needs fixing."
          >
            <div className="grid grid-cols-3 gap-2">
              {(["off", "word", "letter"] as ErrorLockMode[]).map((mode) => (
                <button className={controlButton(errorLockMode === mode)} key={mode} onClick={() => onErrorLockModeChange(mode)}>
                  {titleCase(mode)}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            icon={<Gauge className="h-4 w-4" />}
            title="Pace goal"
            description="Set a personal WPM target so practice has a clear speed line."
          >
            <input
              className="mb-2 w-full rounded-lg border border-line bg-panel/85 px-3 py-2 font-mono font-black outline-none ring-mint/30 transition focus:ring-4"
              max={250}
              min={10}
              type="number"
              value={paceTarget}
              onChange={(event) => onPaceTargetChange(Number(event.target.value))}
            />
            <div className="grid grid-cols-2 gap-2">
              <button className={controlButton(!paceTargetEnabled)} onClick={() => onPaceTargetEnabledChange(false)}>Off</button>
              <button className={controlButton(paceTargetEnabled)} onClick={() => onPaceTargetEnabledChange(true)}>Custom</button>
            </div>
          </SettingRow>

          <SettingRow
            icon={<Target className="h-4 w-4" />}
            title="Typing focus"
            description="Automatically place the cursor into the typing area when a practice run or race starts."
          >
            <div className="grid grid-cols-2 gap-2">
              <button className={controlButton(autoFocusTyping)} onClick={() => onAutoFocusTypingChange(true)}>On</button>
              <button className={controlButton(!autoFocusTyping)} onClick={() => onAutoFocusTypingChange(false)}>Off</button>
            </div>
          </SettingRow>

          <SettingRow
            icon={<Sparkles className="h-4 w-4" />}
            title="Finish animation"
            description="Show the clean completion overlay after strong runs and finished races."
          >
            <div className="grid grid-cols-2 gap-2">
              <button className={controlButton(finishEffects)} onClick={() => onFinishEffectsChange(true)}>On</button>
              <button className={controlButton(!finishEffects)} onClick={() => onFinishEffectsChange(false)}>Off</button>
            </div>
          </SettingRow>
        </div>
      </Panel>

      <Panel title="Account" icon={<Users className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <button className={secondaryButton} onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Logout
          </button>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-coral bg-coral px-3 py-2 font-bold text-white shadow-soft transition hover:brightness-105" onClick={onStartDelete}>
            <Trash2 className="h-4 w-4" /> Delete Account
          </button>
        </div>

        {deleteAccountConfirming && (
          <div className="mt-4 rounded-lg border border-coral bg-surface/80 p-4">
            <h3 className="text-base font-black text-coral">Delete account permanently?</h3>
            <p className="mt-2 text-sm font-medium text-muted">
              This will delete your account, practice sessions, race participation, keystrokes, achievements, friend requests, and rating history. This cannot be undone.
            </p>
            <label className="mt-4 block text-xs font-black uppercase text-muted">Type DELETE to confirm</label>
            <input className={field} value={deleteAccountText} onChange={(event) => onDeleteTextChange(event.target.value)} placeholder="DELETE" />
            <div className="grid gap-2 sm:grid-cols-2">
              <button className={secondaryButton} onClick={onCancelDelete}>Cancel</button>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-coral bg-coral px-3 py-2 font-bold text-white shadow-soft transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deleteAccountText !== "DELETE"}
                onClick={onDeleteAccount}
              >
                <Trash2 className="h-4 w-4" /> Permanently Delete
              </button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function DailyChallengeView({
  challenge,
  typed,
  target,
  metrics,
  remaining,
  running,
  quietMistakes,
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
  quietMistakes: boolean;
  inputRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const leaderboard = challenge?.leaderboard ?? [];
  const showLiveMetrics = running || typed.length > 0;

  return (
    <div className="space-y-4">
      <Panel title="Daily Rules" icon={<CalendarDays className="h-4 w-4" />}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Time" value={formatDuration(challenge?.durationSeconds ?? 60)} />
          <Metric label="Entries" value={String(leaderboard.length)} />
          <Metric label="Best WPM" value={String(challenge?.myEntry?.wpm ?? 0)} />
          <Metric label="Best Score" value={String(challenge?.myEntry?.score ?? 0)} />
        </div>
        <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-semibold text-muted">
          One fixed prompt is shared by everyone each day. You can replay it, but only your best score stays on today&apos;s leaderboard.
        </div>
        <div className="mt-3 rounded-lg border border-line bg-surface/70 p-3 text-sm font-semibold text-muted">
          <kbd className={kbdClass}>Esc</kbd> restarts the current daily run.
        </div>
      </Panel>

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
          quietMistakes={quietMistakes}
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
  quietMistakes?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}>(function TypingText({ prompt, typed, code, focusIndex = 0, active = false, quietMistakes = false, onKeyDown }, ref) {
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
        const state = index < typed.length ? (typed[index] === char || quietMistakes ? "done" : "wrong") : index === typed.length ? "current" : "";
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

function isThemeShade(value: string | null): value is ThemeShade {
  return themeShades.some((shade) => shade.value === value);
}

function isErrorLockMode(value: string | null): value is ErrorLockMode {
  return value === "off" || value === "word" || value === "letter";
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
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

const themeShades: { value: ThemeShade; label: string; color: string }[] = [
  { value: "mint", label: "Mint", color: "#2f8f83" },
  { value: "ocean", label: "Ocean", color: "#4169a8" },
  { value: "violet", label: "Violet", color: "#7c5cc4" },
  { value: "rose", label: "Rose", color: "#c65f7a" },
  { value: "amber", label: "Amber", color: "#b88932" },
  { value: "forest", label: "Forest", color: "#3f7f4f" },
  { value: "slate", label: "Slate", color: "#607080" },
  { value: "crimson", label: "Crimson", color: "#b84848" },
  { value: "indigo", label: "Indigo", color: "#4f5fb8" },
  { value: "lime", label: "Lime", color: "#6f9f3f" },
  { value: "cyan", label: "Cyan", color: "#2b9eb3" },
  { value: "orchid", label: "Orchid", color: "#a8559b" }
];

const achievementMilestones: {
  code: string;
  title: string;
  description: string;
  target: number;
  current: (profile: LeaderboardUser) => number;
  format: (value: number) => string;
}[] = [
  {
    code: "TESTS_10",
    title: "Ten Test Foundation",
    description: "Complete 10 saved typing tests.",
    target: 10,
    current: (profile) => profile.practiceTestsDone + profile.racesDone,
    format: (value) => `${value} tests`
  },
  {
    code: "TESTS_50",
    title: "Fifty Test Habit",
    description: "Complete 50 saved typing tests.",
    target: 50,
    current: (profile) => profile.practiceTestsDone + profile.racesDone,
    format: (value) => `${value} tests`
  },
  {
    code: "TIME_100_MIN",
    title: "Hundred Minute Mark",
    description: "Log 100 minutes of typing time.",
    target: 100,
    current: (profile) => Math.floor(profile.totalTypingSeconds / 60),
    format: (value) => `${value} min`
  },
  {
    code: "TIME_500_MIN",
    title: "Five Hundred Minutes",
    description: "Log 500 minutes of typing time.",
    target: 500,
    current: (profile) => Math.floor(profile.totalTypingSeconds / 60),
    format: (value) => `${value} min`
  },
  {
    code: "BEST_50_WPM",
    title: "Personal Speed 50",
    description: "Reach a saved best of 50 WPM.",
    target: 50,
    current: (profile) => profile.bestWpm,
    format: (value) => `${value} WPM`
  },
  {
    code: "BEST_75_WPM",
    title: "Personal Speed 75",
    description: "Reach a saved best of 75 WPM.",
    target: 75,
    current: (profile) => profile.bestWpm,
    format: (value) => `${value} WPM`
  },
  {
    code: "DAILY_7",
    title: "Weekly Challenger",
    description: "Complete 7 daily challenges.",
    target: 7,
    current: (profile) => profile.achievements.some((achievement) => achievement.code === "DAILY_7") ? 7 : 0,
    format: (value) => `${value} daily`
  },
  {
    code: "AVG_ACCURACY_95",
    title: "Reliable Accuracy",
    description: "Hold at least 95% average accuracy after 20 saved tests.",
    target: 95,
    current: (profile) => profile.practiceTestsDone + profile.racesDone >= 20 ? Math.round(profile.averageAccuracy) : 0,
    format: (value) => `${value}%`
  }
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

function avgNumber(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nextAchievementForProfile(profile: LeaderboardUser | null) {
  if (!profile) {
    return {
      title: "Build Your First Milestone",
      description: "Finish a few saved tests so Velocity Keys can start tracking long-term progress.",
      currentLabel: "0",
      targetLabel: "10 tests",
      percent: 0
    };
  }

  const earned = new Set(profile.achievements.map((achievement) => achievement.code));
  const candidates = achievementMilestones.map((milestone) => {
    const current = milestone.current(profile);
    return {
      ...milestone,
      current,
      percent: Math.min(100, Math.round((current / milestone.target) * 100))
    };
  });
  const next = candidates.find((milestone) => !earned.has(milestone.code) && milestone.current < milestone.target) ?? candidates.at(-1);
  if (!next) {
    return {
      title: "All Milestones Clear",
      description: "You have unlocked every tracked milestone in this build.",
      currentLabel: "done",
      targetLabel: "done",
      percent: 100
    };
  }
  return {
    title: next.title,
    description: next.description,
    currentLabel: next.format(next.current),
    targetLabel: next.format(next.target),
    percent: next.percent
  };
}

function practiceSuggestion(analytics: AnalyticsSummary, history: PracticeHistoryItem[], profile: LeaderboardUser | null) {
  const latest = history[0];
  const weakLetter = analytics.weakLetters[0]?.token?.toUpperCase();
  const weakWord = analytics.weakWords[0]?.token;
  if (weakWord || weakLetter) {
    return {
      title: "Adaptive · Medium · 2 min",
      reason: `Focus on ${weakWord ? `the word "${weakWord}"` : `the letter ${weakLetter}`} while keeping corrections controlled.`,
      mode: "ADAPTIVE" as PracticeMode,
      difficulty: "MEDIUM" as PracticeDifficulty,
      duration: 120
    };
  }
  if (latest && latest.accuracy < 92) {
    return {
      title: "Quote · Easy · 1 min",
      reason: "Your last saved run lost points on accuracy, so use a calmer text before pushing speed again.",
      mode: "QUOTE" as PracticeMode,
      difficulty: "EASY" as PracticeDifficulty,
      duration: 60
    };
  }
  if ((profile?.practiceTestsDone ?? history.length) >= 10) {
    return {
      title: "Code · Medium · 2 min",
      reason: "You have enough baseline tests now; code typing adds symbols and structure for a stronger resume demo.",
      mode: "CODE" as PracticeMode,
      difficulty: "MEDIUM" as PracticeDifficulty,
      duration: 120
    };
  }
  return {
    title: "Words · Medium · 1 min",
    reason: "Build a clean baseline first. A few short word tests will unlock better trends and suggestions.",
    mode: "WORDS" as PracticeMode,
    difficulty: "MEDIUM" as PracticeDifficulty,
    duration: 60
  };
}

function recentActivities(history: PracticeHistoryItem[], analytics: AnalyticsSummary) {
  const practiceActivities = history.slice(0, 4).map((item) => ({
    id: `practice-${item.id}`,
    date: item.createdAt,
    title: `${formatModeLabel(item.mode)} practice`,
    value: `${item.wpm} WPM`,
    detail: `${item.accuracy}% accuracy · ${item.score} score · ${new Date(item.createdAt).toLocaleDateString()}`
  }));
  const raceActivities = analytics.recentRaces.slice(0, 4).map((race) => ({
    id: `race-${race.id}-${race.date}`,
    date: race.date,
    title: race.placement ? `Race finish #${race.placement}` : "Race finish",
    value: `${race.wpm} WPM`,
    detail: `${race.accuracy}% accuracy · ${new Date(race.date).toLocaleDateString()}`
  }));
  return [...practiceActivities, ...raceActivities]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
}

function coachHintForView(currentView: ActiveView, context: { dailyChallenge: DailyChallengeSummary | null; friends: FriendsSummary | null; leaderboard: LeaderboardSummary | null }) {
  if (currentView === "leaderboard") return `There are ${context.leaderboard?.users.length ?? 0} users in this leaderboard view. Open a profile row to compare detailed stats.`;
  if (currentView === "friends") return `You have ${context.friends?.incoming.length ?? 0} incoming requests and ${context.friends?.friends.length ?? 0} accepted friends.`;
  if (currentView === "daily") return context.dailyChallenge?.myEntry ? "Your best daily run is saved. Try again only if you can beat the score." : "Complete today's shared challenge to enter the daily leaderboard.";
  if (currentView === "race") return "Create a room, share the invite link, and wait for every racer to press ready before the countdown starts.";
  if (currentView === "history") return "History is useful for spotting which mode gives your best score and which one needs practice.";
  if (currentView === "profile") return "Profile combines race and practice data, so both solo work and multiplayer results improve the story.";
  if (currentView === "settings") return "Settings change how typing feels: mistake visibility, correction lock, pace target, focus, and finish animation.";
  if (currentView === "help") return "Use this page as the app manual when you forget what each feature does.";
  return "Start with a clean one-minute practice run, then raise difficulty only when accuracy stays stable.";
}

function shouldIgnoreShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea" || target.isContentEditable;
}

function shouldBlockTyping(mode: ErrorLockMode, typed: string, target: string, nextKey: string) {
  if (mode === "off") return false;
  const expected = target[typed.length] ?? "";
  if (mode === "letter") return Boolean(expected) && nextKey !== expected;
  if (nextKey !== " " && nextKey !== "\n") return false;
  const wordStart = Math.max(typed.lastIndexOf(" "), typed.lastIndexOf("\n")) + 1;
  for (let index = wordStart; index < typed.length; index += 1) {
    if (typed[index] !== target[index]) return true;
  }
  return false;
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
