"use client";

import { Flag, Timer, X } from "lucide-react";
import type { RaceInvitation } from "../lib/types";

export function ChallengeInbox({ invitations, userId, now, busy, pending, connected, onRespond }: {
  invitations: RaceInvitation[]; userId: string; now: number; busy: boolean; pending: boolean; connected: boolean;
  onRespond: (id: string, action: "accept" | "decline" | "cancel") => void;
}) {
  return <aside aria-label="Race invitations" className="challenge-stack fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-md space-y-3 overflow-y-auto sm:left-auto sm:right-6 sm:w-96">
    {invitations.map((invite) => {
      const incoming = invite.to.id === userId;
      const remaining = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000));
      return <section key={invite.id} aria-label={incoming ? "Incoming race challenge" : "Sent race challenge"} className="overflow-hidden rounded-2xl border border-mint/40 bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-mint"><Flag className="h-4 w-4" /> {incoming ? "You’re challenged" : "Challenge sent"}</span>
          <span className="flex items-center gap-1 font-mono text-xs text-muted"><Timer className="h-3 w-3" /> {remaining}s</span>
        </div>
        <p role="status" className="break-words text-xl font-bold">{incoming ? invite.from.username : invite.to.username}</p>
        <p className="mt-1 text-sm text-muted">{incoming ? "Meet on the starting line." : "Waiting for your friend to accept."}</p>
        <div className="my-4 flex gap-2 text-xs font-semibold text-muted"><span className="rounded-full bg-surface px-3 py-1">60 seconds</span><span className="rounded-full bg-surface px-3 py-1">Words · Medium</span><span className="rounded-full bg-surface px-3 py-1">1v1</span></div>
        {incoming && busy && <p className="mb-3 text-xs text-brass">Finish your test or leave your current room to accept.</p>}
        <div className="flex gap-2">
          {incoming && <button disabled={busy || pending || !connected || remaining === 0} onClick={() => onRespond(invite.id, "accept")} className="flex-1 rounded-xl bg-mint px-4 py-3 text-sm font-bold text-panel transition hover:brightness-110 disabled:opacity-40">{pending ? "Connecting…" : "Accept challenge"}</button>}
          <button disabled={pending || !connected || remaining === 0} onClick={() => onRespond(invite.id, incoming ? "decline" : "cancel")} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition hover:bg-surface disabled:opacity-40"><X className="h-4 w-4" /> {incoming ? "Decline" : "Cancel invitation"}</button>
        </div>
      </section>;
    })}
  </aside>;
}
