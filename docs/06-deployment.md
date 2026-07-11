# 06 — Deployment

Everything runs on **Railway**: three services (web, api, worker) built from
two Dockerfiles, plus managed Postgres and Redis plugins. CI runs on
**GitHub Actions**. This doc is the runbook: what gets deployed where, every
environment variable each service needs, and the steps to go from a clean
checkout to a live production stack.

## Topology

```
                    ┌──────────────────────────┐
  Browser ────────▶ │  Railway: web              │
                    │  apps/web, Next.js         │
                    │  (Dockerfile, standalone)  │
                    └─────────────┬──────────────┘
                                  │ same-origin rewrite:
                                  │ /api/:path* → API_URL
                                  ▼
                    ┌──────────────────────────┐
                    │  Railway: api              │──┐
                    │  apps/api, Nest            │  │
                    └─────────────┬──────────────┘  │
                                  │                   │ enqueue
                                  ▼                   ▼
                    ┌────────────────┐  ┌───────────────┐
                    │  Railway         │  │ Railway        │
                    │  Postgres plugin │  │ Redis plugin   │
                    └────────────────┘  └───────┬───────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ Railway: worker  │
                                         │ apps/api,        │
                                         │ dist/worker.js   │
                                         └──────────────────┘
```

The web app never talks to the api service directly from the browser.
`apps/web/next.config.ts` rewrites `/api/:path*` to `API_URL` — this keeps
the session cookie first-party (httpOnly, `SameSite=Lax`) instead of needing
a cross-site cookie exception, exactly as if web and api were on the same
domain.

`api` and `worker` are **the same Docker image** (`apps/api/Dockerfile`)
deployed as two Railway services with different start commands — see
`apps/api/railway.api.json` / `apps/api/railway.worker.json`. `web` is a
third service with its own image (`apps/web/Dockerfile` /
`apps/web/railway.web.json`). All three share one Postgres and one Redis
instance; the worker has no HTTP listener and no health check path.

### Why one build-time detail matters: `API_URL` is baked in, not read at runtime

`next.config.ts`'s `rewrites()` is evaluated **during `next build`**, and
its result is written into `.next/routes-manifest.json` — the standalone
server reads that manifest at boot, it does not re-evaluate
`process.env.API_URL` per request. That means `API_URL` must be supplied as
a **Docker build argument**, not just a runtime environment variable.

`apps/web/Dockerfile` declares `ARG API_URL` / `ENV API_URL=$API_URL` right
before the build step specifically so Railway's automatic "expose service
variables as build args for any declared `ARG`" behavior picks it up. When
you set `API_URL` on the web service in the Railway dashboard, set it as a
value visible to the **build** (Railway does this by default for Docker
builds when the `ARG` name matches) — a plain runtime-only variable won't
reach the build and the rewrite will silently fall back to
`http://localhost:4000`.

## One-time setup

### 1. Railway project, Postgres, Redis

```bash
railway login                       # opens a browser, or use RAILWAY_TOKEN for CI
railway init                        # create a new project, or `railway link` an existing one
railway add --plugin postgresql
railway add --plugin redis
```

Note the plugin service names (default `Postgres` / `Redis`) — other
services reference their connection strings via
`${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}` rather than
copy-pasted values, so a credential rotation on the plugin doesn't require
touching every consumer.

### 2. api service

Create a service from this GitHub repo. Config-as-code path:
`apps/api/railway.api.json` (Dockerfile: `apps/api/Dockerfile`, relative to
repo root).

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` — see note below, this one matters more than it looks |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex — generate with `openssl rand -hex 32`, store nowhere else |
| `APP_ORIGIN` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console OAuth client |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | from Azure App Registration |
| `MICROSOFT_TENANT` | `common` (or your tenant ID for single-tenant) |
| `OPENAI_API_KEY` | from OpenAI dashboard |
| `OPENAI_MODEL` | `gpt-4o-mini` (or your preferred model) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generate with `npx web-push generate-vapid-keys`, or `node -e "console.log(require('web-push').generateVAPIDKeys())"` |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |

Leaving the `VAPID_*` variables unset doesn't break anything — `PushService`
checks for them and silently no-ops (`GET /push/public-key` returns an empty
string, and the frontend's Notifications settings page hides the "Enable
push" toggle entirely). Same values go on the **worker** service below,
since that's the process that actually calls `webpush.sendNotification`
when new mail arrives.

`${{web.RAILWAY_PUBLIC_DOMAIN}}` is Railway's built-in cross-service
reference — it resolves once the `web` service has a public domain
generated (Settings → Networking → Generate Domain), so create the `web`
service before finalizing this value.

**Why `PORT` is set explicitly:** Railway healthchecks against its own
`$PORT` for the service, which is not necessarily the port the app
happens to bind. `main.ts` listens on `process.env.PORT` when Railway
provides it, falling back to `API_PORT` (default 4000) otherwise — but
the service's public domain `targetPort` (set when you run
`railway domain --service api --port 4000`, or via the dashboard) is a
*separate* fixed value that has to agree with whatever port the app
actually listens on. Pinning `PORT=4000` here removes the ambiguity: the
app always listens on 4000, the domain always routes to 4000, and the
healthcheck always probes 4000. Skipping this was the actual root cause
the first time this was deployed — the container booted cleanly and
logged "listening on :4000", but Railway's healthcheck kept failing with
"service unavailable" because it was probing a different, dynamically
assigned port the app never listened on.

**Release command (migrations):** set the api service's release command
(Railway calls this `preDeployCommand`) to:

```
node_modules/.bin/prisma migrate deploy
```

This runs *inside the runtime container*, not the build stage — there's no
pnpm, no workspace context, and no `apps/` layout there, just the pruned
`/prod/api` tree the Dockerfile produces. That's why it can't be
`pnpm --filter @novamail/api exec prisma migrate deploy` (pnpm isn't
installed in the runtime image) and why the Dockerfile moves `prisma` from
a devDependency to a runtime dependency and copies `apps/api/prisma/`
(schema + migrations) into the deployed tree explicitly — `pnpm deploy`
only follows the package.json dependency graph, not arbitrary source
files.

Do **not** bake `prisma migrate deploy` into the container's `CMD` — Railway
runs the release command once per deploy, before new instances take
traffic, whereas a `CMD`-embedded migration would re-run on every replica
boot and race against itself if `numReplicas` is ever increased.

### 3. worker service

Second service, same repo, same Dockerfile (`apps/api/Dockerfile`),
config-as-code path `apps/api/railway.worker.json`. Same environment
variables as the api service — it needs `DATABASE_URL`, `REDIS_URL`,
`TOKEN_ENCRYPTION_KEY`, and the OAuth/OpenAI credentials to run the
sync/send/snooze job processors. No release command here — migrations are
owned by the api service.

### 4. web service

Third service, same repo, Dockerfile `apps/web/Dockerfile`,
config-as-code path `apps/web/railway.web.json`.

Environment variables:

| Variable | Value | Visible to |
|---|---|---|
| `API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` | **build** (see note above) |
| `PORT` | `3000` | runtime |

Same reasoning as the api service's `PORT`: the Dockerfile sets
`ENV PORT=3000` as a default, but Railway's own assigned `$PORT`
overrides it at runtime and can be a different value (observed: 8080),
while the domain's `targetPort` stays fixed at whatever you set when
creating it (3000). The Next.js standalone server always honors
`process.env.PORT`, so an unpinned `PORT` here is a real "app boots fine,
edge proxy gets nothing on the port it's routing to" failure mode, not a
theoretical one — this is exactly what happened on first deploy.

Generate a public domain for this service (Settings → Networking →
Generate Domain) — that's the URL end users hit, and the value the api
service's `APP_ORIGIN` should reference.

### 5. OAuth redirect URIs

Both Google Cloud Console and the Azure App Registration need the
production callback URLs added (in addition to the localhost ones used for
dev):

- Google: `https://<api-service-domain>/api/v1/auth/google/callback`
- Microsoft: `https://<api-service-domain>/api/v1/auth/microsoft/callback`

(Exact path per `docs/05-api-design.md`'s auth routes — update if those
routes move.)

## Provisioning via CLI

The full sequence, once you have a `RAILWAY_TOKEN` (Project Token or Account
Token, from Railway → Account Settings → Tokens):

```bash
export RAILWAY_TOKEN=...            # never commit this

railway init --name novamail        # or: railway link <existing-project-id>

railway add --plugin postgresql
railway add --plugin redis

# api
railway add --service api --repo <owner>/<repo>
railway variables --service api \
  --set NODE_ENV=production \
  --set PORT=4000 \
  --set DATABASE_URL='${{Postgres.DATABASE_URL}}' \
  --set REDIS_URL='${{Redis.REDIS_URL}}' \
  --set TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --set GOOGLE_CLIENT_ID=... --set GOOGLE_CLIENT_SECRET=... \
  --set MICROSOFT_CLIENT_ID=... --set MICROSOFT_CLIENT_SECRET=... --set MICROSOFT_TENANT=common \
  --set OPENAI_API_KEY=... --set OPENAI_MODEL=gpt-4o-mini \
  --set VAPID_PUBLIC_KEY=... --set VAPID_PRIVATE_KEY=... --set VAPID_SUBJECT=mailto:you@yourdomain.com

# worker — same variables, no release command
railway add --service worker --repo <owner>/<repo>
railway variables --service worker \
  --set NODE_ENV=production \
  --set DATABASE_URL='${{Postgres.DATABASE_URL}}' \
  --set REDIS_URL='${{Redis.REDIS_URL}}' \
  --set TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --set GOOGLE_CLIENT_ID=... --set GOOGLE_CLIENT_SECRET=... \
  --set MICROSOFT_CLIENT_ID=... --set MICROSOFT_CLIENT_SECRET=... --set MICROSOFT_TENANT=common \
  --set OPENAI_API_KEY=... --set OPENAI_MODEL=gpt-4o-mini \
  --set VAPID_PUBLIC_KEY=... --set VAPID_PRIVATE_KEY=... --set VAPID_SUBJECT=mailto:you@yourdomain.com

# web
railway add --service web --repo <owner>/<repo>
railway domain --service web --port 3000   # generates a public domain, prints it
railway variables --service web \
  --set API_URL='https://${{api.RAILWAY_PUBLIC_DOMAIN}}' \
  --set PORT=3000

railway domain --service api --port 4000   # generates api's public domain
railway variables --service api --set APP_ORIGIN='https://${{web.RAILWAY_PUBLIC_DOMAIN}}'
```

Point each service's config-as-code path and release command via the
dashboard (Settings → Config-as-code / Deploy), since those aren't yet
exposed as `railway variables` flags. Exact flag names vary by CLI version
— run `railway --help` / `railway <command> --help` to confirm against
whatever version you have installed.

`TOKEN_ENCRYPTION_KEY` must be the **same value** on both `api` and
`worker` — generate it once and set it on both, don't run
`openssl rand -hex 32` twice.

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

Neither job deploys anything — Railway deploys independently on push once
"Deploy on push" is enabled per service (or via `railway up` / the CLI
sequence above for manual/CI-triggered deploys). CI is the merge gate;
Railway's own webhook is the deploy trigger.

## Post-deploy checklist

After the first deploy (and after any change to env vars or OAuth apps):

1. `GET https://<api-domain>/api/v1/health` returns
   `{"status":"ok","postgres":"ok","redis":"ok"}`.
2. `GET https://<web-domain>/login` returns 200 and renders the sign-in
   page (this is also the web service's health check path).
3. Load the web URL, confirm "Sign in with Google" / "Sign in with
   Microsoft" both redirect to the correct provider consent screen
   (verifies `APP_ORIGIN`, OAuth client IDs, and redirect URIs are all
   correct).
4. Complete a real OAuth sign-in, confirm the inbox loads with synced
   threads (verifies the worker is running, `DATABASE_URL`/`REDIS_URL` are
   shared correctly between api and worker, and the provider sync jobs are
   processing).
5. Send a test email and confirm undo-send and delivery both work
   (verifies BullMQ delayed jobs and provider send scopes).
6. Trigger an AI action (summarize a thread) and confirm streaming works
   end-to-end through the web→api rewrite (verifies `OPENAI_API_KEY` and
   that SSE isn't buffered by an intermediary — double check after any
   change to the rewrite or a Railway proxy config change).
7. If `API_URL` or `APP_ORIGIN` ever changes (e.g. a custom domain), redeploy
   the **web** service (not just restart) — the rewrite destination is
   baked in at build time, a runtime variable change alone won't take
   effect.

## Local reproduction of the Docker builds

This sandbox's network policy blocks pulling `node:22-alpine` from Docker
Hub, so neither Dockerfile was validated with an actual `docker build` here.
Both were instead validated by executing their `RUN` steps directly on the
host and running the resulting artifacts:

- `apps/api/Dockerfile`: dependency install, `prisma generate`,
  `turbo build`, `pnpm deploy --filter=@novamail/api --prod --legacy`,
  inspected the output tree.
- `apps/web/Dockerfile`: `next build` with `API_URL` set, confirmed the
  rewrite destination lands in `.next/routes-manifest.json`, copied
  `.next/standalone` + `.next/static` into the same layout the runtime
  stage produces, and booted `node apps/web/server.js` directly — it served
  `/login` (200) and `/` (307 auth redirect) correctly.

If you have Docker Hub access, verify both with a real build before the
first Railway deploy, since Railway's own build environment is the actual
source of truth and hasn't been exercised from this environment either:

```bash
docker build -f apps/api/Dockerfile -t novamail-api .
docker build -f apps/web/Dockerfile -t novamail-web --build-arg API_URL=https://api.example.com .
```
