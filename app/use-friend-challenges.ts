"use client";

import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { FriendPresence, FriendsLiveState, RaceInvitation } from "../lib/types";

export function useFriendChallenges(socket: Socket | null, busy: boolean, notify: (message: string, tone?: "info" | "success" | "error") => void) {
  const [live, setLive] = useState<FriendsLiveState>({ presence: {}, invitations: [] });
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!socket) return;
    const sync = () => { setConnected(true); socket.emit("friends:sync"); };
    const disconnect = () => { setConnected(false); setLive({ presence: {}, invitations: [] }); };
    const state = (value: FriendsLiveState) => setLive(value);
    const presence = ({ userId, status }: { userId: string; status: FriendPresence }) => setLive((value) => ({ ...value, presence: { ...value.presence, [userId]: status } }));
    const invitation = (invite: RaceInvitation) => setLive((value) => ({ ...value, invitations: [...value.invitations.filter((i) => i.id !== invite.id), invite] }));
    const closed = ({ id, reason }: { id: string; reason: string }) => {
      setLive((value) => ({ ...value, invitations: value.invitations.filter((i) => i.id !== id) }));
      notify(reason);
      socket.emit("friends:sync");
    };
    socket.on("connect", sync).on("disconnect", disconnect).on("friends:state", state)
      .on("friends:presence", presence).on("challenge:invitation", invitation).on("challenge:closed", closed);
    if (socket.connected) sync();
    const timer = window.setInterval(() => { if (socket.connected) socket.emit("friends:sync"); }, 10000);
    return () => {
      window.clearInterval(timer);
      socket.off("connect", sync).off("disconnect", disconnect).off("friends:state", state)
        .off("friends:presence", presence).off("challenge:invitation", invitation).off("challenge:closed", closed);
      setConnected(false);
      setLive({ presence: {}, invitations: [] });
    };
  }, [socket, notify]);
  useEffect(() => {
    if (!socket) return;
    const update = () => socket.emit("friends:activity", busy);
    update();
    socket.on("connect", update);
    return () => { socket.off("connect", update); };
  }, [socket, busy]);
  const request = useCallback((event: string, payload: unknown) => {
    if (!socket?.connected) { notify("Reconnecting. Try again once you are online.", "error"); return; }
    if (pending) return;
    setPending(true);
    socket.timeout(15000).emit(event, payload, (error: Error | null, result?: { error?: string }) => {
      setPending(false);
      if (error || result?.error) notify(result?.error ?? "The request timed out. Reconnecting will restore your invitation status.", "error");
      socket.emit("friends:sync");
    });
  }, [socket, pending, notify]);
  return { ...live, connected, pending, send: (id: string) => request("challenge:send", id), respond: (id: string, action: "accept" | "decline" | "cancel") => request("challenge:respond", { id, action }) };
}
