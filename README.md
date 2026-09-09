# Velocity Keys

Velocity Keys is a real-time TypeRacer-style app built with Next.js, React, Node.js, Socket.io, PostgreSQL, and Prisma.

## Features

- Email/password signup and login with JWT auth
- Private room creation, room-code joins, public rooms, and spectator joins
- Skill-based public matchmaking
- Live friend availability (available, busy, offline), with available-first cards and search
- Direct friend challenges: accept, decline, or cancel a 60-second private Words duel
- Live race state over Socket.io: countdowns, progress, WPM, accuracy, consistency, and leaderboards
- Anti-cheat scoring from keystroke timing, paste-speed bursts, machine-like intervals, and implausible finish times
- Stored keystroke events for ghost replay
- Adaptive practice prompts from weak letters and words
- Prose, quote, custom text, and code-typing race modes
- Analytics dashboard for WPM trends, accuracy trends, rating history, consistency, weak-token heatmaps, and recent races

## Deployment Notes

- Use a platform that supports a long-running Node.js server because Socket.io needs persistent WebSocket connections.
- Attach a managed PostgreSQL database and set `DATABASE_URL`.
- Set `JWT_SECRET` and `NEXT_PUBLIC_APP_URL` for the deployed domain.
- Run Prisma migrations during release so the production database has the latest schema.

## Architecture Notes

- Main navigation links to Practice, Race, Daily, Friends, and Leaderboard. The avatar menu contains Profile, Typing history, Settings, Help, and Sign out; small screens use a collapsible main menu.
- Each section has its own URL. `app/(workspace)/layout.tsx` preserves the session and live socket across navigation, while `app/site-header.tsx` owns the responsive header. Legacy `/?room=CODE` invitations redirect to `/race?room=CODE`.

- `server/index.ts` owns Express routes, auth APIs, analytics APIs, and Socket.io events.
- `server/race-service.ts` keeps active room state in memory and persists race results, skill rating updates, practice stats, and keystroke events to PostgreSQL.
- `server/friend-challenges.ts` handles friends-only presence and expiring, single-use race invitations over authenticated sockets.
- `app/client-app.tsx` is the main UI; `app/use-friend-challenges.ts` and `app/challenge-inbox.tsx` handle live friend state and invitation cards.
- `prisma/schema.prisma` defines the durable data model for users, rooms, races, participants, replay events, practice stats, and ratings.

For production, move the active race-room store to Redis or another shared low-latency store before running multiple Node instances.

## Friend challenges

Open Friends and choose Challenge beside an available friend. Invitations appear across the app and expire after 60 seconds. Acceptance creates a private two-player Words race (Medium difficulty, 60 seconds); both players still press Start Race when ready. Busy players must finish their test or leave their current room first. Closing one of several tabs keeps a player online; losing their last connection cancels pending invitations.

Presence and pending invitations are in memory, like the existing room store: restarting the server clears them. No database migration is needed for this feature. Shared presence, invitations, and Socket.io routing are required before scaling to multiple server instances.

Run `npm run typecheck` and `npm run build` for TypeScript and production validation.
