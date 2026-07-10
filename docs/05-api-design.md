# 05 — API Design

REST, versioned under `/api/v1`. Session cookie auth (httpOnly) + CSRF token on
mutations. All bodies validated against Zod schemas from `packages/shared` —
the same schemas generate the frontend client types.

**Conventions**
- Envelope: success → resource JSON; errors → `{ error: { code, message, details? } }`
  with proper status codes (`400 VALIDATION`, `401 UNAUTHENTICATED`,
  `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 RATE_LIMITED`).
- Lists use **cursor pagination**: `?cursor=<opaque>&limit=50` →
  `{ items, nextCursor }` (stable under new-mail inserts, unlike offsets).
- All ids are cuids. Timestamps are ISO-8601 UTC.
- `accountId=<id>|unified` query param on mail routes; default `unified`.

## Auth

| Method | Path | Description |
|---|---|---|
| GET | `/auth/google` | begin Google OAuth (redirect) |
| GET | `/auth/google/callback` | code exchange → create/link account → session |
| GET | `/auth/microsoft` | begin Microsoft OAuth |
| GET | `/auth/microsoft/callback` | " |
| GET | `/auth/session` | current user + accounts + settings (app bootstrap) |
| POST | `/auth/logout` | destroy session |

Adding a second provider account reuses the same routes with
`?intent=link` while a session exists.

## Accounts

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | connected accounts + `syncStatus`, progress |
| PATCH | `/accounts/:id` | color, display name |
| DELETE | `/accounts/:id` | disconnect (revoke + purge mail data) |
| POST | `/accounts/:id/resync` | force full delta/reconcile |

## Threads (list & triage)

| Method | Path | Description |
|---|---|---|
| GET | `/threads?folder=inbox&accountId=unified&cursor=…` | folder listing; also `?label=<id>`, `?filter=priority\|snoozed\|starred` |
| GET | `/threads/:id` | thread with messages (bodies sanitized), attachments, labels, cached AI artifacts |
| PATCH | `/threads/:id` | partial triage update: `{ folder?, isStarred?, isPinned?, isRead?, snoozedUntil? }` — snooze/unsnooze is `snoozedUntil: date \| null` |
| POST | `/threads/bulk` | `{ ids: string[], patch: <same shape> }` for multi-select |

One PATCH shape for all triage keeps optimistic updates uniform:
the client mirrors the patch into the cache and rolls back on error.

## Messages (compose & send)

| Method | Path | Description |
|---|---|---|
| POST | `/messages/drafts` | create draft `{ accountId, to[], cc[], bcc[], subject, bodyHtml, replyToMessageId?, mode: new\|reply\|replyAll\|forward }` |
| PATCH | `/messages/drafts/:id` | autosave (debounced client-side) |
| DELETE | `/messages/drafts/:id` | discard |
| POST | `/messages/:id/send` | `{ scheduledAt? }` → `QUEUED`; delayed job = max(undo window, scheduledAt) |
| POST | `/messages/:id/undo` | cancel within window → back to `DRAFT` (409 if already dispatched) |
| POST | `/messages/:id/attachments` | multipart upload → attachment meta |
| DELETE | `/messages/:id/attachments/:attId` | remove from draft |
| GET | `/attachments/:id/download` | streams blob (provider fetch-through), `?disposition=inline` for preview |

## Labels

| Method | Path | Description |
|---|---|---|
| GET | `/labels` | user's labels with counts |
| POST | `/labels` | `{ name, color }` |
| PATCH | `/labels/:id` | rename / recolor |
| DELETE | `/labels/:id` | delete (detaches threads) |
| POST | `/threads/:id/labels` | `{ labelId }` attach |
| DELETE | `/threads/:id/labels/:labelId` | detach; also confirms/rejects AI-suggested labels via `PATCH { isAiSuggested: false }` |

## Search

| Method | Path | Description |
|---|---|---|
| GET | `/search?q=…&cursor=…` | instant search; `q` supports operators (`from:`, `to:`, `in:`, `is:`, `has:attachment`, `label:`, `before:`, `after:`). Returns `{ threads, contacts, labels }` grouped for the palette |
| POST | `/search/nl` | `{ query: "invoice from john last month" }` → `{ filter: StructuredFilter, results, nextCursor }`; the filter echoes back for chip rendering |

`StructuredFilter` (shared Zod schema — the contract between the AI compiler
and the FTS query builder):

```ts
{
  keywords?: string[]
  from?: string[]        // resolved emails
  to?: string[]
  dateFrom?: string      // ISO date
  dateTo?: string
  hasAttachment?: boolean
  attachmentType?: 'pdf' | 'image' | 'doc' | 'sheet' | 'any'
  folder?: Folder
  labelIds?: string[]
  isUnread?: boolean
  isStarred?: boolean
  accountId?: string
}
```

## AI

Interactive endpoints stream **SSE** (`Content-Type: text/event-stream`):
`event: delta` (token chunks) → `event: done` (full payload + `artifactId`) →
or `event: error`. Cached artifacts short-circuit to a single `done`.

| Method | Path | Description |
|---|---|---|
| POST | `/ai/threads/:id/summary` | stream thread summary |
| POST | `/ai/messages/:id/summary` | stream single-message summary |
| POST | `/ai/threads/:id/reply-suggestions` | `{ }` → 3 suggestions `{ tone, subjectless body }` (JSON `done`, no stream) |
| POST | `/ai/drafts/:id/rewrite` | `{ instruction?, tone? }` → streams rewritten body |
| POST | `/ai/threads/:id/action-items` | `{ }` → `[{ text, deadline?, sourceMessageId }]` |
| POST | `/ai/messages/:id/translate` | `{ targetLang }` → streams translation |
| POST | `/ai/threads/:id/ask` | `{ question, history?: QA[] }` → streams answer scoped to thread |
| POST | `/ai/threads/:id/explain` | streams context explanation ("who is this, what's the state") |
| GET | `/ai/briefing?date=today` | today's daily briefing artifact (pre-computed) |
| GET | `/ai/reminders` | active follow-up reminders |
| POST | `/ai/reminders/:id/dismiss` | dismiss |
| POST | `/ai/reminders/:id/nudge` | AI-drafts a follow-up → returns new draft id |

Rate limits: 30 interactive AI calls / 5 min / user (429 with `retryAfter`).

## Events (realtime)

| Method | Path | Description |
|---|---|---|
| GET | `/events` | SSE stream, multiplexed typed events |

```
event: mail.updated        data: { accountId, threadIds }        → invalidate queries
event: sync.progress       data: { accountId, percent }
event: sendStatus.changed  data: { messageId, status }           → toast transitions
event: snooze.fired        data: { threadId }
event: reminder.due        data: { reminderId }
event: briefing.ready      data: { date }
```

Heartbeat comment every 25s; client `EventSource` auto-reconnects with
`Last-Event-ID` replay from a short Redis ring buffer, so missed events during
reconnects aren't lost.

## Webhooks (provider → us, unauthenticated ingress, verified)

| Method | Path | Verification |
|---|---|---|
| POST | `/webhooks/gmail` | Pub/Sub JWT (OIDC) audience check |
| POST | `/webhooks/graph` | `validationToken` handshake + `clientState` secret |

Handlers validate, enqueue `sync:delta`, return 200 in < 100 ms.

## Users & settings

| Method | Path | Description |
|---|---|---|
| GET | `/me` | profile + settings |
| PATCH | `/me/settings` | theme, undo window, AI toggles, briefing hour, timezone |

## Rate-limit & error summary

| Bucket | Limit |
|---|---|
| `ai` | 30 / 5 min |
| `search` | 60 / min |
| `send` | 100 / hour |
| general mutations | 600 / min |

All limits return `429` with `{ error: { code: 'RATE_LIMITED', retryAfter } }`.
