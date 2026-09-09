import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import type { ClientUser, FriendPresence, RaceInvitation, RaceSnapshot } from "../lib/types";

type Dependencies = {
  now?: () => number;
  friendIds: (userId: string) => Promise<string[]>;
  getUser: (userId: string) => Promise<ClientUser | null>;
  isBusy: (userId: string) => boolean;
  createDuel: (users: ClientUser[]) => Promise<RaceSnapshot>;
};

// Invitations and presence have the same single-process lifetime as live races.
export function installFriendChallenges(io: Server, deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const invitations = new Map<string, RaceInvitation>();
  const accepting = new Set<string>();
  const lastSent = new Map<string, number>();
  const socketsFor = (id: string) => [...io.sockets.sockets.values()].filter((s) => s.data.user?.id === id);
  const emit = (id: string, event: string, value: unknown) => socketsFor(id).forEach((s) => s.emit(event, value));
  const presence = (id: string): FriendPresence => {
    const sockets = socketsFor(id);
    if (!sockets.length) return "offline";
    return deps.isBusy(id) || accepting.has(id) || sockets.some((s) => s.data.typingBusy) ? "busy" : "online";
  };
  const pending = (id: string) => [...invitations.values()].some((i) => i.from.id === id || i.to.id === id);
  const close = (invite: RaceInvitation, reason: string) => {
    invitations.delete(invite.id);
    for (const id of [invite.from.id, invite.to.id]) emit(id, "challenge:closed", { id: invite.id, reason });
  };
  const publish = async (id: string) => {
    const ids = await deps.friendIds(id);
    ids.forEach((friendId) => emit(friendId, "friends:presence", { userId: id, status: presence(id) }));
  };
  const sync = async (id: string) => {
    const ids = await deps.friendIds(id);
    emit(id, "friends:state", {
      presence: Object.fromEntries(ids.map((friendId) => [friendId, presence(friendId)])),
      invitations: [...invitations.values()].filter((i) => (i.from.id === id || i.to.id === id) && i.expiresAt > now())
    });
  };
  const timer = setInterval(() => {
    for (const invitation of invitations.values()) {
      if (invitation.expiresAt <= now() && !accepting.has(invitation.to.id)) close(invitation, "Invitation expired.");
    }
    for (const [id, at] of lastSent) if (now() - at > 60000) lastSent.delete(id);
  }, 1000);
  timer.unref();
  io.engine.on("close", () => clearInterval(timer));

  io.on("connection", (socket) => {
    const userId: string = socket.data.user.id;
    const refresh = () => { void sync(userId).catch(() => undefined); };
    refresh();
    void publish(userId).catch(() => undefined);
    socket.on("friends:sync", refresh);
    socket.on("friends:activity", (busy: unknown) => {
      socket.data.typingBusy = busy === true;
      void publish(userId).catch(() => undefined);
    });
    socket.on("disconnect", () => {
      if (!socketsFor(userId).length) {
        for (const invite of invitations.values()) {
          if ((invite.from.id === userId || invite.to.id === userId) && !accepting.has(userId)) close(invite, "Invitation cancelled: player disconnected.");
        }
      }
      void publish(userId).catch(() => undefined);
    });
    socket.on("challenge:send", async (target: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      try {
        if (typeof target !== "string" || target === userId) throw new Error("Choose a friend to challenge.");
        if (now() - (lastSent.get(userId) ?? 0) < 5000) throw new Error("Wait a moment before sending another challenge.");
        lastSent.set(userId, now());
        if (!(await deps.friendIds(userId)).includes(target)) throw new Error("You can only challenge accepted friends.");
        const users = await Promise.all([deps.getUser(userId), deps.getUser(target)]);
        if (!users[0] || !users[1]) throw new Error("Player is no longer available.");
        if (presence(userId) !== "online" || presence(target) !== "online") throw new Error("Both players must be online and available. Finish your test or leave your race room first.");
        if (pending(userId) || pending(target)) throw new Error("A player already has a pending invitation.");
        const safe = (u: ClientUser) => ({ id: u.id, username: u.username, rating: u.rating });
        const invite: RaceInvitation = { id: randomUUID(), from: safe(users[0]), to: safe(users[1]), expiresAt: now() + 60000 };
        invitations.set(invite.id, invite);
        emit(userId, "challenge:invitation", invite);
        emit(target, "challenge:invitation", invite);
        ack({ ok: true });
      } catch (error) { ack({ error: error instanceof Error ? error.message : "Could not send invitation." }); }
    });
    socket.on("challenge:respond", async (payload: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      let locked: RaceInvitation | undefined;
      try {
        const { id, action } = (payload ?? {}) as { id?: unknown; action?: unknown };
        const invite = typeof id === "string" ? invitations.get(id) : undefined;
        if (!invite || invite.expiresAt <= now()) throw new Error("This invitation has expired or was cancelled.");
        if (accepting.has(invite.from.id) || accepting.has(invite.to.id)) throw new Error("This invitation is already being accepted.");
        if (action === "cancel" && invite.from.id === userId) { close(invite, "Invitation cancelled."); ack({ ok: true }); return; }
        if (invite.to.id !== userId || (action !== "accept" && action !== "decline")) throw new Error("You cannot respond to this invitation.");
        if (action === "decline") { close(invite, "Invitation declined."); ack({ ok: true }); return; }
        if (presence(invite.from.id) !== "online" || presence(userId) !== "online") throw new Error("Both players must be available. Finish your test or leave your race room first.");
        locked = invite;
        accepting.add(invite.from.id); accepting.add(invite.to.id);
        if (!(await deps.friendIds(userId)).includes(invite.from.id)) throw new Error("You are no longer friends.");
        const users = await Promise.all([deps.getUser(invite.from.id), deps.getUser(userId)]);
        if (!users[0] || !users[1]) throw new Error("Player is no longer available.");
        if ([userId, invite.from.id].some((id) => !socketsFor(id).length || deps.isBusy(id) || socketsFor(id).some((s) => s.data.typingBusy))) throw new Error("A player is no longer available.");
        const snapshot = await deps.createDuel([users[0], users[1]]);
        for (const player of snapshot.players) {
          for (const s of socketsFor(player.userId)) {
            // A finished room must not keep delivering snapshots over the new duel.
            for (const room of s.rooms) if (room !== s.id) s.leave(room);
            s.join(snapshot.roomCode);
          }
          emit(player.userId, "challenge:matched", snapshot);
        }
        close(invite, "Challenge accepted. Your private duel is ready.");
        ack({ ok: true });
      } catch (error) {
        if (locked) close(locked, "Could not start the duel. Please send a new invitation.");
        ack({ error: error instanceof Error ? error.message : "Could not respond to invitation." });
      } finally {
        if (locked) {
          accepting.delete(locked.from.id); accepting.delete(locked.to.id);
          void publish(locked.from.id).catch(() => undefined);
          void publish(locked.to.id).catch(() => undefined);
        }
      }
    });
  });
}
