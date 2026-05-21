# supaWake

Keeps your Supabase free-tier projects alive by auto-pinging every 3 days.

**Live app:** <https://supa-wake.netlify.app>

Supabase pauses free projects after 7 days of inactivity. supaWake hits the
`/auth/v1/health` endpoint on each registered project on a 3-day cron schedule
(`0 0 */3 * *`), resetting the idle timer before it expires.

## How it works

1. Add a project ref and your anon/publishable API key in the UI.
2. supaWake stores them in Netlify Blobs.
3. A Netlify scheduled function pings every project every 3 days.
4. The dashboard shows the last ping time and HTTP status for each project.

You can also trigger a manual ping at any time from the UI.

## API key requirement

Supabase's API gateway requires an `apikey` header on **every** request,
including public health endpoints. Without a key the gateway returns `401`.

Use your project's **anon key** or **publishable key** — both work:

| Key type          | Where to find it                          | Format               |
| ----------------- | ----------------------------------------- | -------------------- |
| Publishable key   | Project Settings → API Keys → Publishable | `sb_publishable_...` |
| Anon / legacy JWT | Project Settings → API Keys → anon public | `eyJ...`             |

> **Security warning:** Never enter a Service Role key or any secret key here.
> supaWake is a public app — only use anon or publishable keys, which are safe
> to expose in browser environments.

## Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Frontend      | React 18 · Vite · TypeScript                        |
| API           | Netlify Functions v2 (TypeScript `.mts`)            |
| Storage       | Netlify Blobs (strong consistency)                  |
| Cron          | Netlify Scheduled Functions (`0 0 */3 * *`)         |
| Local dev API | NestJS · SQLite (better-sqlite3) · @nestjs/schedule |

## Local development

The repo has two runnable layers: a Netlify-native layer (deployed) and a
NestJS backend for local iteration without a Netlify account.

```bash
# NestJS backend (local only)
cd backend
npm install
npm run start:dev   # http://localhost:3001

# React frontend (separate terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173 → proxies /api to :3001
```

## Deploying to Netlify

The frontend is pre-built before deployment (Netlify's build environment can't
run Vite due to permission constraints on some plans).

```bash
# Build frontend locally
cd frontend && npm run build

# Deploy via Netlify CLI
netlify deploy --prod
```

`netlify.toml` points `publish` at `frontend/dist` and `functions` at
`netlify/functions`. No build command is set — deploy the pre-built dist.

## Project structure

```text
supaWake/
├── frontend/          # React + Vite app
│   └── src/App.tsx
├── netlify/
│   └── functions/
│       ├── api.mts        # REST API: GET/POST/DELETE /api/projects*
│       └── cron-ping.mts  # Scheduled ping every 3 days
├── backend/           # NestJS app for local dev
│   └── src/projects/
├── netlify.toml
└── package.json       # Root deps: @netlify/blobs, @netlify/functions
```
