# 01 — System Architecture

## Guiding principles

1. **Perceived speed is the product.** Every architectural choice optimizes for
   instant interactions: optimistic updates, local-first reads from the TanStack
   Query cache, background sync, streaming AI.
2. **Provider APIs, not IMAP.** Since auth is Google/Microsoft OAuth, we use the
   Gmail API and Microsoft Graph API. They give us push notifications, delta
   sync, labels, and send-as — far more reliable than IMAP/SMTP.
3. **The database is the source of truth for the UI.** The client never talks to
   Gmail/Graph directly. Workers sync provider state into Postgres; the UI reads
   from our API. This is what makes unified inbox, instant search, snooze, and
   undo-send possible.
4. **AI is real and server-side.** All OpenAI calls happen in the NestJS API
   (keys never reach the browser), stream over SSE, and are cached in Redis so
   repeated actions (e.g. re-opening a summarized thread) are free and instant.

## High-level topology

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                                   │
│  React + TanStack Query + Framer Motion                              │
│  · optimistic mutations   · SSE subscriptions (sync events, AI)      │
└───────────────┬──────────────────────────────────────────────────────┘
                │ HTTPS (REST /api/v1 + SSE)
┌───────────────▼──────────────────────────────────────────────────────┐
│  NestJS API                                                          │
│  auth · mail · threads · drafts · search · ai · labels · events      │
│  ├── Prisma ──────────► PostgreSQL  (threads, messages, FTS, users)  │
│  ├── ioredis ─────────► Redis       (sessions, AI cache, rate limits)│
│  └── BullMQ producers ► Redis queues                                 │
└───────────────┬──────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────┐
│  Workers (separate NestJS process, BullMQ consumers)                 │
│  · sync (initial backfill + delta)      · send (undo-send delay)     │
│  · scheduled-send                       · snooze / un-snooze         │
│  · ai-background (smart labels, briefing, follow-up detection)       │
│  ├──► Gmail API (watch/history.list)  ├──► Microsoft Graph (delta)   │
│  └──► OpenAI API                                                     │
└──────────────────────────────────────────────────────────────────────┘
        ▲                                   ▲
        │ Pub/Sub push (Gmail watch)        │ Graph change webhooks
   Google Cloud Pub/Sub               Microsoft Graph subscriptions
```

**Deployables:** `web` (Next.js), `api` (NestJS HTTP), `worker` (NestJS BullMQ
consumers — same codebase as `api`, different entrypoint). Postgres and Redis
are managed services. Three processes, one backend codebase: scalable without
microservice overhead.

## Email sync pipeline

The hardest subsystem; designed first.

### Initial backfill (on account connect)
1. OAuth completes → `EmailAccount` row created with encrypted refresh token.
2. `sync:backfill` job enqueued. Worker pages through the provider mailbox
   newest-first (Gmail `messages.list`, Graph `/messages`), upserting
   `Thread` / `Message` / `Attachment` rows in batches of ~100.
3. Inbox is usable after the first batch (~1s); backfill continues in the
   background with progress events pushed to the client over SSE.
4. On completion, store the sync cursor (Gmail `historyId`, Graph `deltaLink`).

### Incremental sync (steady state)
- **Push:** Gmail `users.watch` → Cloud Pub/Sub → webhook; Graph change
  subscriptions → webhook. Webhook handlers only enqueue a `sync:delta` job
  (idempotent, debounced per account) — never do work in the request cycle.
- **Delta jobs** replay changes from the stored cursor (`history.list` /
  `deltaLink`): new messages, read/unread, label changes, deletions.
- **Fallback polling** every 2 minutes per account catches missed webhooks and
  handles cursor expiry (full resync when Gmail returns 404 on a stale
  `historyId`).
- Every applied change publishes a `mail.updated` event on a Redis pub/sub
  channel; the API's SSE gateway fans it out to that user's open clients, which
  invalidate the relevant TanStack Query keys. The inbox updates live without
  the client ever polling.

### Write-back (two-way sync)
User actions (archive, star, label, mark read, delete, move to spam) are:
1. Applied **optimistically** in the client cache.
2. Persisted to Postgres immediately (API responds < 50 ms).
3. Mirrored to the provider by a `sync:writeback` job with retry + exponential
   backoff. Provider failure ≠ user-visible failure; a dead-letter queue and a
   reconciliation pass in the polling job repair any drift.

## Sending pipeline: undo send & schedule send

Send is never synchronous — that's what makes undo free:

1. `POST /messages/send` writes the message with `sendStatus=QUEUED` and
   enqueues a `send:dispatch` job **delayed by the user's undo window**
   (default 10 s; 0/5/10/30 configurable).
2. Client shows the "Sent — Undo" toast. **Undo** = `POST /messages/:id/undo`
   → remove the delayed job, flip the message back to a draft.
3. When the delay elapses, the worker sends via Gmail/Graph send API, stores
   the provider message id, sets `sendStatus=SENT`.
4. **Schedule send** is the same mechanism with a longer delay (persisted
   `scheduledAt` so jobs are re-enqueued if Redis is rebuilt).
5. **Snooze** likewise: set `snoozedUntil`, hide from inbox queries, delayed
   job returns it to the top of the inbox and fires an SSE event.

## Search architecture

Two cooperating layers behind one endpoint:

1. **Instant structured search (Postgres).** A generated `tsvector` column on
   `messages` (subject + body + participants, weighted) with a GIN index, plus
   `pg_trgm` for prefix/fuzzy matching on contacts and subjects. Powers
   as-you-type results in < 50 ms. Supports operators (`from:`, `to:`, `has:attachment`,
   `in:`, `is:`, `before:`/`after:`, `label:`).
2. **Natural-language search (AI query compiler).** Free-text queries like
   *"invoice from John last month"* are compiled by a small OpenAI call
   (structured output → our filter schema: sender ≈ John, date range = last
   month, keywords = invoice) and then executed as layer-1 queries. The
   compiled filter is shown to the user as removable chips, so AI search is
   transparent and correctable. Compilations are cached in Redis by normalized
   query text.

The command palette (⌘K) hits layer 1 on every keystroke and offers "Ask AI"
as an explicit escalation when the query looks like natural language.

*Future (not v1):* pgvector embeddings for semantic recall. The `SearchService`
interface is designed so this slots in as a third layer without API changes.

## AI subsystem

- **`AiService`** in NestJS wraps the OpenAI SDK: model selection, prompt
  templates (versioned constants), token budgeting (long threads are chunked
  and map-reduced), retries, and cost logging per user.
- **Streaming:** interactive features (summarize, rewrite, ask-anything, reply
  drafts) stream over SSE token-by-token. The client renders into the AI panel
  with a streaming cursor.
- **Caching:** deterministic artifacts (thread summary, action items,
  translation) are cached in Redis keyed by `(messageId | threadId, feature,
  promptVersion, targetLang?)` and persisted to `ai_artifacts` for durable
  reuse. Cache is invalidated when new messages arrive on a thread.
- **Background AI:** smart labels, meeting/deadline extraction, follow-up
  detection, and the daily briefing run as BullMQ jobs on new-mail events and a
  morning cron — results are pre-computed before the user opens the app.
- **Guardrails:** email bodies are sent to OpenAI only for user-initiated
  features or features the user has enabled in settings; a per-user daily token
  budget prevents runaway cost; every prompt includes an instruction wall
  against following instructions embedded in email content (prompt-injection
  hygiene).

## Realtime events (SSE)

One `GET /events` SSE stream per client session, multiplexing typed events:
`mail.updated`, `sync.progress`, `sendStatus.changed`, `snooze.fired`,
`reminder.due`. Chosen over WebSockets because the flow is strictly
server→client, it survives proxies/serverless better, and it keeps the client
trivial (an `EventSource` + query invalidation map).

## Security model

- **Sessions:** httpOnly, Secure, SameSite=Lax cookie holding an opaque session
  id → Redis session record (revocable, sliding expiry). No JWTs in
  localStorage.
- **Provider tokens:** refresh tokens encrypted at rest with AES-256-GCM
  (key from env/KMS, per-row random IV). Access tokens cached in Redis with
  TTL, refreshed by workers on demand. Tokens never leave the backend.
- **CSRF:** double-submit token on mutating routes (cookie-based auth requires it).
- **Rate limiting:** Redis token buckets per user on `ai/*` and `search`.
- **Validation:** every request body validated with Zod schemas shared from
  `packages/shared` — the same schemas type the frontend API client, so client
  and server can't drift.
- **HTML email rendering:** sanitized server-side (allowlist), rendered in a
  sandboxed iframe with CSP; remote images proxied and blocked by default.

## Frontend architecture

- **Next.js App Router**, route groups: `(auth)` and `(app)`. The app shell
  (three columns) is a persistent layout so navigation never remounts columns.
- **Server state = TanStack Query** exclusively (infinite queries for the email
  list, normalized by thread id, optimistic mutations with rollback).
- **Client state = small contexts + reducers**: selection/focus state, compose
  windows, AI panel, theme, keyboard scope. No global state library needed.
- **Keyboard system:** a single `KeyboardProvider` owning a scope stack
  (`list → thread → compose → palette`). Shortcuts register declaratively via
  `useShortcut(scope, keys, handler)`; the active scope wins, ESC pops. This is
  the backbone of the Superhuman feel and is built in Phase 3 before features.
- **Design tokens:** Tailwind theme extended with semantic CSS variables
  (`--background`, `--surface`, `--accent`, …) so dark/light/system theming is
  a class flip with zero component changes. shadcn/ui components restyled to
  the Linear-like aesthetic (4px radius grid, soft shadows, hairline borders
  only where necessary).

## Cross-cutting decisions

| Decision | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | shared types/schemas between web & api; one CI |
| API style | REST + SSE, versioned `/api/v1` | simple, cacheable; GraphQL adds no value at this shape |
| Contracts | Zod schemas in `packages/shared` | one source of truth for both runtime validation and TS types |
| IDs | `cuid2` | sortable-ish, URL-safe, no coordination |
| Drafts | rows in `messages` with `folder=DRAFTS` | reply/forward/scheduled/undo are all states of one entity |
| Rich text | Tiptap | headless, ProseMirror-based, matches the minimal aesthetic |
| Testing | Vitest + Testing Library (web), Jest (api), Playwright (e2e) | phase 7 |
