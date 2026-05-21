# supaWake

Keeps your Supabase free-tier projects alive by pinging them every 3 days.

Supabase pauses free projects after 7 days of inactivity. supaWake hits the
`/auth/v1/health` endpoint on each registered project on a 3-day cron,
resetting the idle timer.

## Stack

- **Backend** — NestJS · SQLite (better-sqlite3) · @nestjs/schedule
- **Frontend** — React 18 · Vite

## Quick start

```bash
# backend
cd backend
npm install
npm run start:dev   # http://localhost:3001

# frontend (separate terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173
```

## Adding a project

Paste any of these into the input:
- `abcdefghijklmnop` (raw project ref)
- `https://abcdefghijklmnop.supabase.co`
- `abcdefghijklmnop.supabase.co`

The app normalises them all to the project ref and stores it in a local
`projects.db` SQLite file next to the backend.
