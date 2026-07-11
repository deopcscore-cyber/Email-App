# NovaMail — The AI-powered email for focused people

A premium, keyboard-first email client in the spirit of Superhuman, Linear, and
Arc. Multi-account (Gmail + Outlook), unified inbox, deep OpenAI integration,
and an interface designed to feel fast, minimal, and expensive.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, TanStack Query |
| Backend | NestJS, PostgreSQL, Prisma, Redis, BullMQ |
| Auth | Google OAuth 2.0 + Microsoft OAuth 2.0 with PKCE (provider APIs, no raw IMAP) |
| AI | OpenAI API (streaming, server-side only) |

## Repository layout

```
apps/web        Next.js frontend (proxies /api/* to the backend)
apps/api        NestJS backend — HTTP API (main.ts) + BullMQ worker (worker.ts)
packages/shared Zod schemas + constants shared by both sides
packages/config Shared tsconfig base
docs/           Architecture documentation
e2e/            Playwright end-to-end suite
```

## Local development

```bash
pnpm install
pnpm db:up                        # postgres + redis via docker compose
cp .env.example apps/api/.env     # fill in the values below
pnpm db:migrate                   # prisma migrate dev
pnpm dev                          # web on :3000, api on :4000
```

Required in `apps/api/.env`:

- `TOKEN_ENCRYPTION_KEY` — `openssl rand -hex 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client (Web) with
  redirect URI `http://localhost:3000/api/v1/auth/google/callback` and the
  Gmail API enabled
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — Azure app registration
  with redirect URI `http://localhost:3000/api/v1/auth/microsoft/callback`
- `OPENAI_API_KEY` — powers every AI feature (summaries, replies, rewrite,
  natural-language search, daily briefing); the app runs without it, AI
  endpoints just 503

The web app proxies `/api/*` to the API, so the session cookie is first-party
and OAuth callbacks share the web origin.

## Testing

Three layers, matching the stack each targets:

| Layer | Tool | Scope |
|---|---|---|
| `apps/api` unit + integration | Jest + Supertest | Pure logic (token vault, MIME builder, search parser, CSRF guard) and full HTTP-level flows against a real Postgres/Redis (auth+CSRF, threads/triage, drafts→send→undo, search) |
| `apps/web` unit + component | Vitest + Testing Library | Formatters, the keyboard scope system (via real DOM keydown events), `EmailRow`, `RecipientField` |
| `e2e/` end-to-end | Playwright | The real app in a real browser: auth gate, inbox, keyboard shortcuts, compose/send/undo, search — against a running API + web stack |

```bash
# API — spins up nothing itself; needs a dedicated test database once:
createdb novamail_test  # or: psql -c "CREATE DATABASE novamail_test OWNER novamail;"
DATABASE_URL=postgresql://novamail:novamail@localhost:5432/novamail_test \
  pnpm --filter @novamail/api exec prisma migrate deploy
pnpm --filter @novamail/api test        # Jest; uses TEST_DATABASE_URL/TEST_REDIS_URL if set

# Web — no backend required, everything is mocked/rendered in jsdom
pnpm --filter @novamail/web test        # Vitest

# End-to-end — requires the real stack running and seeded:
pnpm db:up                              # or local postgres/redis
pnpm --filter @novamail/api exec node prisma/seed.mjs
pnpm dev                                # api :4000, web :3000 (separate terminal)
pnpm test:e2e                           # Playwright, reads e2e/
```

`pnpm test` (root) runs the Jest and Vitest suites via Turborepo; Playwright is
separate (`test:e2e`) since it depends on a live, seeded stack rather than
booting one itself. Re-seed (`node prisma/seed.mjs`) before an e2e run if a
prior run has mutated the dev mailbox (archived/starred/sent threads) — the
suite is written to tolerate that (e.g. it asserts count deltas, not absolute
counts) but starts from a known state either way.

## Documentation

1. [System Architecture](docs/01-architecture.md)
2. [Folder Structure](docs/02-folder-structure.md)
3. [Database Schema](docs/03-database-schema.md)
4. [User Flows](docs/04-user-flows.md)
5. [API Design](docs/05-api-design.md)
6. [Deployment](docs/06-deployment.md)

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, folder structure, DB schema, user flows, API design | ✅ |
| 2 | Authentication — OAuth (PKCE), sessions, CSRF, encrypted token vault | ✅ |
| 3 | Dashboard UI — shell, list, reading pane, AI panel, keyboard system | ✅ |
| 4 | Email features — sync engine, compose, undo/schedule send, snooze, search, SSE | ✅ |
| 5 | AI integration — streaming assistant, NL search, briefing, smart labels | ✅ |
| 6 | Animations & micro-interactions — motion system, reduced-motion support | ✅ |
| 7 | Testing — Jest/Supertest (API), Vitest/RTL (web), Playwright (e2e) | ✅ |
| 8 | Deployment — Railway (web/api/worker/Postgres/Redis), GitHub Actions CI | ✅ |

## Deployment

Everything ships to Railway: three services (web, api, worker) built from
two Dockerfiles (api and worker share `apps/api/Dockerfile`; web has its own
`apps/web/Dockerfile`), plus managed Postgres and Redis plugins. GitHub
Actions gates every push with lint/typecheck/build/test/e2e. Full runbook —
environment variables per service, OAuth redirect URIs, migration strategy,
CLI provisioning commands, post-deploy
checklist — is in [docs/06-deployment.md](docs/06-deployment.md).

CI workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
