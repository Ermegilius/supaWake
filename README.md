# supaWake

Keeps your Supabase free-tier projects alive by auto-pinging every 3 days.

**Live app:** <https://supa-wake.netlify.app>

Supabase pauses free projects after 7 days of inactivity. supaWake pings each
registered project every 3 days (`0 0 */3 * *`). You can choose a ping
strategy per project.

> **Key finding (verified over 1 week):** only pings that actually touch
> Postgres keep a project alive. Read-only endpoints like `auth/settings` do
> **not** prevent pausing. The default strategy is now `auth/signup` with a
> real email, which writes to `auth.users`.

## How it works

1. Add a project ref and your anon/publishable API key in the UI.
2. Choose a ping strategy. The default `auth/signup` requires a real email.
3. supaWake stores the project in Netlify Blobs.
4. A Netlify scheduled function pings every project every 3 days.
5. The dashboard shows the last ping time and HTTP status for each project.

## Ping strategies

Two strategies are selectable in the UI. Both touch Postgres, which is the
activity Supabase actually measures.

### ✅ `auth/signup` (default, keeps project alive)

`POST /auth/v1/signup` with a **real email address** (Supabase validates MX
records). The first ping creates a user in `auth.users`; later pings hit the
same table with a duplicate-check `SELECT` (HTTP 422). Either way Postgres is
touched. Confirmed to survive the 7-day pause whether or not the confirmation
email is clicked.

If the project has "Confirm email" enabled, Supabase sends a confirmation
email on the first ping; clicking it is optional.

### 🧪 `auth/token` (login probe, under test)

`POST /auth/v1/token?grant_type=password` with throwaway credentials. GoTrue
runs a `SELECT` on `auth.users` to verify the login, finds nothing, and
returns HTTP 400, with **no user created, no email sent, and no email rate limit**.
This should be a DB hit with zero side effects. Currently being tested to
confirm it prevents pausing; if it does, it will become the new default.

## Ping strategy history

Several approaches were tried and rejected before settling on `auth/signup`.
They are documented here as a record; none are selectable in the UI.

### ❌ `GET /storage/v1/bucket` (original)

Should have counted as DB activity, but projects were still being paused.

### ❌ `POST /auth/v1/signup` with `wake@supawake.invalid`

Supabase rejects `.invalid` TLD with `email_address_invalid` (HTTP 400).
No user created, no DB write.

### ❌ `POST /auth/v1/signup` with `wake@example.com`

Supabase's GoTrue performs **MX-record validation**. `example.com` has no MX
records, so it is rejected with `email_address_invalid` (HTTP 400).

Additionally, the free tier limits outbound emails to **2 per hour**. Even
failed send attempts count toward this limit, causing all subsequent signup
calls to return `over_email_send_rate_limit` (HTTP 429) for ~1 hour.

### ❌ `GET /auth/v1/settings`

Public read-only endpoint with no email, no user creation, and no rate limits; always
returns 200. Was made the default, but a 1-week live test proved it does
**not** prevent pausing: it never touches Postgres, which is the activity
Supabase actually measures.

### ✅ `POST /auth/v1/signup` with a real email (current default)

Writes to `auth.users` on every ping. Verified to survive the 7-day pause
across multiple test projects, with and without email confirmation.

## API key requirement

Supabase's API gateway requires an `apikey` header on every request.
Without a key the gateway returns `401`.

Use your project's **anon key** or **publishable key**:

| Key type          | Where to find it                          | Format               |
| ----------------- | ----------------------------------------- | -------------------- |
| Publishable key   | Project Settings → API Keys → Publishable | `sb_publishable_...` |
| Anon / legacy JWT | Project Settings → API Keys → anon public | `eyJ...`             |

> **Security warning:** Never enter a Service Role key or any secret key here.
> supaWake is a public app, so only use anon or publishable keys, which are safe
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

```bash
# Build frontend locally
cd frontend && npm run build

# Deploy via Netlify CLI
netlify deploy --prod
```

`netlify.toml` points `publish` at `frontend/dist` and `functions` at
`netlify/functions`. No build command is set; deploy the pre-built dist.

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
