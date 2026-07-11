# 06 — Deployment

Web on **Vercel**, API + worker + Postgres + Redis on **Railway**. CI on
**GitHub Actions**. This doc is the runbook: what gets deployed where, every
environment variable each service needs, and the steps to go from a clean
checkout to a live production stack.

## Topology

```
                         ┌────────────────────┐
  Browser ─────────────▶ │  Vercel (web)       │
                         │  apps/web, Next.js  │
                         └─────────┬───────────┘
                                   │ same-origin rewrite:
                                   │ /api/:path* → API_URL
                                   ▼
                         ┌────────────────────┐
                         │  Railway (api)      │
                         │  apps/api, Nest     │──┐
                         └─────────┬───────────┘  │
                                   │               │ enqueue
                                   ▼               ▼
                         ┌────────────────┐  ┌───────────────┐
                         │  Railway        │  │ Railway        │
                         │  Postgres       │  │ Redis          │
                         └────────────────┘  └───────┬───────┘
                                                       │
                                              ┌────────▼────────┐
                                              │ Railway (worker) │
                                              │ apps/api,        │
                                              │ dist/worker.js   │
                                              └──────────────────┘
```

The web app never talks to Railway directly from the browser. `apps/web/next.config.ts`
rewrites `/api/:path*` to `API_URL` server-side, so the browser only ever sees
Vercel's origin — this keeps the session cookie first-party (httpOnly,
`SameSite=Lax`) instead of needing a cross-site cookie exception.

`api` and `worker` are **the same Docker image** (`apps/api/Dockerfile`)
deployed as two Railway services with different start commands — see
`apps/api/railway.api.json` / `apps/api/railway.worker.json`. They share one
Postgres and one Redis instance; the worker has no HTTP listener and no
health check path.

## One-time setup

### 1. Railway — Postgres and Redis

Create a Railway project, add the **Postgres** and **Redis** plugins. Note
their connection strings (`DATABASE_URL`, `REDIS_URL`) — Railway injects
these automatically into services in the same project if you use variable
references (`${{Postgres.DATABASE_URL}}`), which is the recommended approach
over copy-pasting.

### 2. Railway — api service

Create a new service from this GitHub repo, root the build at the repo root
(the Dockerfile path is relative to repo root: `apps/api/Dockerfile`).
Point its config at `apps/api/railway.api.json` (Railway → Settings →
Config-as-code path), or paste its contents into the dashboard build/deploy
settings if you'd rather not rely on the file being auto-detected.

Environment variables (Settings → Variables):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex — generate with `openssl rand -hex 32`, store nowhere else |
| `APP_ORIGIN` | `https://<your-vercel-domain>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console OAuth client |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | from Azure App Registration |
| `MICROSOFT_TENANT` | `common` (or your tenant ID for single-tenant) |
| `OPENAI_API_KEY` | from OpenAI dashboard |
| `OPENAI_MODEL` | `gpt-4o-mini` (or your preferred model) |

`API_PORT` does not need to be set — Nest listens on `4000` and Railway's
proxy targets whatever port the container exposes; `EXPOSE 4000` in the
Dockerfile documents this to Railway's port auto-detection.

**Release command (migrations):** set the service's release command to:

```
pnpm --filter @novamail/api exec prisma migrate deploy
```

Do **not** bake `prisma migrate deploy` into the container's `CMD` — Railway
runs the release command once per deploy, before the new instances take
traffic, whereas a `CMD`-embedded migration would re-run on every replica
boot and race against itself if `numReplicas` is ever increased.

### 3. Railway — worker service

Add a second service from the **same repo**, same Dockerfile
(`apps/api/Dockerfile`), config-as-code path `apps/api/railway.worker.json`.
Same environment variables as the api service (it needs `DATABASE_URL`,
`REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, and the OAuth/OpenAI credentials to run
sync/send/snooze jobs) — no release command needed here, migrations are
owned by the api service.

### 4. Vercel — web app

Import the repo into Vercel. In **Project Settings → General**:

- **Root Directory**: `apps/web` (this cannot be set via a committed file —
  it's a dashboard-only setting)
- Framework preset: Next.js (auto-detected)

`apps/web/vercel.json` supplies the install/build commands, which `cd`
back to the monorepo root so Turborepo can see the full workspace:

```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm turbo build --filter=@novamail/web"
}
```

Environment variables (Project Settings → Environment Variables):

| Variable | Value |
|---|---|
| `API_URL` | Railway api service's public URL, e.g. `https://novamail-api.up.railway.app` |

That's the only one the web app needs — everything else (OAuth, OpenAI,
encryption) lives server-side on the api service.

### 5. OAuth redirect URIs

Both Google Cloud Console and the Azure App Registration need the production
callback URLs added (in addition to the localhost ones used for dev):

- Google: `https://<railway-api-domain>/api/v1/auth/google/callback`
- Microsoft: `https://<railway-api-domain>/api/v1/auth/microsoft/callback`

(Exact path per `docs/05-api-design.md`'s auth routes — update if those
routes move.)

## CI — GitHub Actions

`.github/workflows/ci.yml` runs on every push to `main` and every pull
request:

- **`checks`** — spins up Postgres + Redis service containers, generates the
  Prisma client, applies migrations to a scratch `novamail_test` database,
  then runs lint, typecheck, `turbo build`, the Jest suite (`apps/api`), and
  the Vitest suite (`apps/web`).
- **`e2e`** — depends on `checks`; builds and boots the real api + web
  processes against fresh service containers, seeds the dev database, waits
  for both `http://localhost:4000/api/v1/health` and `http://localhost:3000`
  to respond, then runs the Playwright suite. Uploads the HTML report and
  service logs as artifacts on failure.

Neither job deploys anything — Vercel and Railway both deploy independently
on push via their own GitHub integrations once connected (Vercel: automatic
on every push to the production branch; Railway: enable "Deploy on push" per
service). CI is the merge gate; the platforms' own webhooks are the deploy
trigger.

## Post-deploy checklist

After the first deploy (and after any change to env vars or OAuth apps):

1. `GET https://<railway-api-domain>/api/v1/health` returns
   `{"status":"ok","postgres":"ok","redis":"ok"}`.
2. Load the Vercel URL, confirm the login page renders and "Sign in with
   Google" / "Sign in with Microsoft" both redirect to the correct
   provider consent screen (verifies `APP_ORIGIN`, OAuth client IDs, and
   redirect URIs are all correct).
3. Complete a real OAuth sign-in, confirm the inbox loads with synced
   threads (verifies the worker is running, `DATABASE_URL`/`REDIS_URL` are
   shared correctly between api and worker, and the provider sync jobs are
   processing).
4. Send a test email and confirm undo-send and delivery both work
   (verifies BullMQ delayed jobs and provider send scopes).
5. Trigger an AI action (summarize a thread) and confirm streaming works
   end-to-end through the Vercel rewrite (verifies `OPENAI_API_KEY` and that
   SSE isn't buffered by an intermediary — Vercel's rewrite passes SSE
   through, but double check after any proxy config change).

## Local reproduction of the Docker build

This sandbox's network policy blocks pulling `node:22-alpine` from Docker
Hub, so `apps/api/Dockerfile` was validated by executing each `RUN` step
directly on the host (dependency install, `prisma generate`, `turbo build`,
`pnpm deploy --filter=@novamail/api --prod --legacy`) rather than a full
`docker build`. If you have Docker Hub access, verify with:

```bash
docker build -f apps/api/Dockerfile -t novamail-api .
docker run --rm -e DATABASE_URL=... -e REDIS_URL=... -e TOKEN_ENCRYPTION_KEY=... \
  -p 4000:4000 novamail-api
curl localhost:4000/api/v1/health
```

before the first real Railway deploy, since Railway's own build environment
is the actual source of truth and hasn't been exercised from this
environment either.
