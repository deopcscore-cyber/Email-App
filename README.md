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
apps/api        NestJS backend (HTTP now; worker entrypoint arrives in Phase 4)
packages/shared Zod schemas + constants shared by both sides
packages/config Shared tsconfig base
docs/           Architecture documentation (Phase 1)
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

The web app proxies `/api/*` to the API, so the session cookie is first-party
and OAuth callbacks share the web origin.

## Documentation

1. [System Architecture](docs/01-architecture.md)
2. [Folder Structure](docs/02-folder-structure.md)
3. [Database Schema](docs/03-database-schema.md)
4. [User Flows](docs/04-user-flows.md)
5. [API Design](docs/05-api-design.md)

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, folder structure, DB schema, user flows, API design | ✅ |
| 2 | Authentication — OAuth (PKCE), sessions, CSRF, encrypted token vault | ✅ |
| 3 | Dashboard UI (three-column layout, theming, responsive shell) | ⏳ |
| 4 | Email features (sync, compose, triage, search, shortcuts) | ⏳ |
| 5 | AI integration (panel, streaming, smart features) | ⏳ |
| 6 | Animations & micro-interactions | ⏳ |
| 7 | Testing | ⏳ |
| 8 | Deployment | ⏳ |
