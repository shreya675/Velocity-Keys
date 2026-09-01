# Velocity Keys

Velocity Keys is a real-time TypeRacer-style app built with Next.js, React, Node.js, Socket.io, PostgreSQL, and Prisma.

## Features

- Email/password signup and login with JWT auth
- Private room creation, room-code joins, public rooms, and spectator joins
- ELO-banded public matchmaking
- Live race state over Socket.io: countdowns, progress, WPM, accuracy, consistency, and leaderboards
- Anti-cheat scoring from keystroke timing, paste-speed bursts, machine-like intervals, and implausible finish times
- Stored keystroke events for ghost replay
- Adaptive practice prompts from weak letters and words
- Prose, quote, custom text, and code-typing race modes
- Analytics dashboard for WPM trends, accuracy trends, rating history, consistency, weak-token heatmaps, and recent races

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and point `DATABASE_URL` at a PostgreSQL database.

3. Generate Prisma and run the migration:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

4. Start the custom Next.js and Socket.io server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Architecture Notes

- `server/index.ts` owns Express routes, auth APIs, analytics APIs, and Socket.io events.
- `server/race-service.ts` keeps active room state in memory and persists race results, ELO updates, practice stats, and keystroke events to PostgreSQL.
- `app/page.tsx` is the main multiplayer UI: lobby, typing track, leaderboard, anti-cheat status, adaptive practice, ghost replay list, and analytics.
- `prisma/schema.prisma` defines the durable data model for users, rooms, races, participants, replay events, practice stats, and ratings.

For production, move the active race-room store to Redis or another shared low-latency store before running multiple Node instances.
