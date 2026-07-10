# 02 — Folder Structure

Feature-based on both sides. Rule of thumb: **code lives with its feature;
only truly shared code is promoted** to `components/ui`, `lib`, or
`packages/shared`.

```
email-app/
├── apps/
│   ├── web/                          # Next.js frontend
│   └── api/                          # NestJS backend (+ worker entrypoint)
├── packages/
│   ├── shared/                       # Zod schemas, API types, constants
│   │   └── src/
│   │       ├── schemas/              # auth.ts, message.ts, thread.ts, ai.ts, search.ts
│   │       ├── types/                # inferred + hand-written shared types
│   │       └── constants/            # folders, shortcuts, limits, prompt versions
│   └── config/                       # shared tsconfig, eslint, prettier, tailwind preset
├── docs/                             # architecture docs (this folder)
├── turbo.json
├── pnpm-workspace.yaml
└── docker-compose.yml                # local postgres + redis
```

## `apps/web` — Next.js

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx            # OAuth entry screen
│   ├── (app)/
│   │   ├── layout.tsx                # persistent 3-column shell + providers
│   │   ├── [folder]/page.tsx         # inbox | priority | snoozed | sent | drafts | spam | trash
│   │   ├── [folder]/[threadId]/page.tsx
│   │   ├── label/[labelId]/page.tsx
│   │   └── settings/…
│   ├── layout.tsx                    # root: fonts, ThemeProvider, QueryProvider
│   └── globals.css                   # design tokens (CSS variables)
│
├── features/                         # ── the heart of the app ──
│   ├── mail-list/                    # center column
│   │   ├── components/               # EmailList, EmailRow, RowActions, EmptyState, ListSkeleton
│   │   ├── hooks/                    # useThreads (infinite), useThreadActions (optimistic), useListSelection
│   │   ├── api/                      # threads.api.ts (typed fetchers)
│   │   └── types.ts
│   ├── thread-view/                  # right column (reading pane)
│   │   ├── components/               # ThreadView, MessageCard, MessageBody (sandboxed iframe),
│   │   │                             # AttachmentChip, ThreadHeader, QuickReply
│   │   ├── hooks/                    # useThread, useMarkRead
│   │   └── api/
│   ├── compose/
│   │   ├── components/               # ComposeModal, RecipientField (chips + cc/bcc), Editor (Tiptap),
│   │   │                             # AttachmentDropzone, SendButton (undo/schedule split-button)
│   │   ├── hooks/                    # useComposeWindows, useDraftAutosave, useSend, useAttachmentUpload
│   │   └── api/
│   ├── search/
│   │   ├── components/               # CommandPalette, SearchResults, FilterChips
│   │   ├── hooks/                    # useInstantSearch (debounced), useNlSearch
│   │   └── api/
│   ├── ai/
│   │   ├── components/               # AiPanel, AiActionBar, StreamingText, ActionItemsCard,
│   │   │                             # DailyBriefing, ToneSelector, TranslateMenu
│   │   ├── hooks/                    # useAiStream (SSE), useSummary, useReplySuggestions, useAskAi
│   │   └── api/
│   ├── labels/                       # LabelBadge, LabelPicker, ManageLabels + hooks/api
│   ├── accounts/                     # AccountSwitcher, unified-inbox toggle, ConnectAccount + hooks/api
│   ├── snooze/                       # SnoozePopover (natural-language times) + hooks/api
│   ├── shortcuts/                    # KeyboardProvider, useShortcut, ShortcutsHelpModal (?), scopes.ts
│   └── auth/                         # useSession, signIn/signOut, AuthGuard
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (restyled)
│   └── layout/                       # AppShell, Sidebar, ColumnResizer, ThemeToggle, Topbar
├── contexts/                         # ThemeContext, SelectionContext, ComposeContext, AiPanelContext
├── hooks/                            # useMediaQuery, useEventSource, useDebounce, useHotkeyLabel
├── lib/                              # api-client.ts (fetch wrapper), query-client.ts, query-keys.ts,
│                                     # sse.ts, sanitize.ts, dates.ts, motion.ts (shared variants)
├── types/                            # web-only types (route params, ui state)
└── utils/                            # formatters, guards
```

## `apps/api` — NestJS

```
apps/api/src/
├── main.ts                           # HTTP entrypoint
├── worker.ts                         # BullMQ worker entrypoint (same DI container)
├── app.module.ts
│
├── modules/                          # feature modules
│   ├── auth/                         # controllers: /auth/google, /auth/microsoft, /auth/session
│   │   ├── auth.controller.ts / auth.service.ts
│   │   ├── strategies/               # google.strategy.ts, microsoft.strategy.ts
│   │   ├── guards/                   # session.guard.ts, csrf.guard.ts
│   │   └── token-vault.service.ts    # AES-256-GCM encrypt/decrypt, refresh handling
│   ├── accounts/                     # connected email accounts CRUD, sync status
│   ├── threads/                      # list/get/mutate threads (archive, star, read, move)
│   ├── messages/                     # send, undo, drafts, attachments
│   ├── labels/
│   ├── search/                       # instant + NL search endpoints
│   │   ├── search.service.ts         # FTS query builder
│   │   └── nl-compiler.service.ts    # OpenAI → filter schema
│   ├── ai/                           # SSE streaming endpoints + artifact cache
│   │   ├── ai.controller.ts / ai.service.ts
│   │   ├── prompts/                  # versioned prompt templates per feature
│   │   └── artifacts.service.ts
│   ├── sync/                         # provider sync engine
│   │   ├── providers/                # gmail.provider.ts, graph.provider.ts, provider.interface.ts
│   │   ├── webhooks.controller.ts    # /webhooks/gmail, /webhooks/graph
│   │   └── sync.service.ts           # backfill, delta, writeback, reconcile
│   ├── events/                       # SSE gateway (/events) + Redis pub/sub bridge
│   └── users/                        # profile, settings (undo window, AI toggles, theme)
│
├── jobs/                             # BullMQ processors (consumed by worker.ts)
│   ├── queues.ts                     # queue names + typed payloads
│   ├── sync.processor.ts
│   ├── send.processor.ts             # undo-send delay, scheduled send
│   ├── snooze.processor.ts
│   └── ai-background.processor.ts    # smart labels, briefing, follow-up detection
│
├── common/                           # interceptors, exception filters, decorators (@CurrentUser),
│                                     # zod validation pipe, rate-limit guard
├── prisma/                           # prisma.service.ts
└── config/                           # typed env config (validated at boot)

apps/api/prisma/
├── schema.prisma
└── migrations/                       # includes raw SQL migration for tsvector + GIN indexes
```

## Conventions

- **Imports point inward:** `features/*` may import from `components/ui`,
  `lib`, `hooks`, `packages/shared` — never from another feature. Cross-feature
  communication goes through contexts or query cache, keeping features
  deletable.
- **Every feature folder** exposes a small public surface via `index.ts`;
  internals stay private.
- **API fetchers** (`features/*/api`) are the only place `lib/api-client` is
  called with concrete paths; components never fetch directly.
- **No `any`.** `tsconfig` has `strict: true`, `noUncheckedIndexedAccess: true`;
  ESLint bans `any` and unhandled promises.
