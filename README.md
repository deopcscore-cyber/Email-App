# Meridian — AI-Powered Email Client

A premium, keyboard-first email client in the spirit of Superhuman, Linear, and Arc.
Multi-account (Gmail + Outlook), unified inbox, deep OpenAI integration, and an
interface designed to feel fast, minimal, and expensive.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, TanStack Query |
| Backend | NestJS, PostgreSQL, Prisma, Redis, BullMQ |
| Auth | Google OAuth 2.0, Microsoft OAuth 2.0 (provider APIs, no raw IMAP) |
| AI | OpenAI API (streaming, server-side only) |

## Documentation

Phase 1 deliverables live in [`docs/`](docs/):

1. [System Architecture](docs/01-architecture.md)
2. [Folder Structure](docs/02-folder-structure.md)
3. [Database Schema](docs/03-database-schema.md)
4. [User Flows](docs/04-user-flows.md)
5. [API Design](docs/05-api-design.md)

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, folder structure, DB schema, user flows, API design | ✅ This commit |
| 2 | Authentication (Google + Microsoft OAuth, sessions, token vault) | ⏳ |
| 3 | Dashboard UI (three-column layout, theming, responsive shell) | ⏳ |
| 4 | Email features (sync, compose, triage, search, shortcuts) | ⏳ |
| 5 | AI integration (panel, streaming, smart features) | ⏳ |
| 6 | Animations & micro-interactions | ⏳ |
| 7 | Testing | ⏳ |
| 8 | Deployment | ⏳ |
