# 03 — Database Schema

PostgreSQL via Prisma. Modeling decisions first, then the full schema.

## Key decisions

1. **`User` vs `EmailAccount`.** One user (the person who logs in) owns many
   connected email accounts. Unified inbox = querying threads across all of a
   user's accounts; per-account inbox = filtering by `accountId`.
2. **Threads are first-class.** The list UI, snooze, labels, and AI summaries
   operate on threads; messages hang off them. Provider thread ids are mapped
   per account.
3. **Drafts, scheduled, and outgoing mail are `Message` rows** distinguished by
   `sendStatus` + `folder`. Undo-send is just `QUEUED → DRAFT`; schedule-send is
   `QUEUED` with `scheduledAt`. One entity, one state machine.
4. **Folder is an enum, labels are rows.** The seven system folders are an enum
   on `Thread` (fast, indexable). User labels are many-to-many via
   `ThreadLabel`, with `isAiSuggested` to mark smart labels until confirmed.
5. **Bodies stay in Postgres** (`bodyHtml`/`bodyText`, TOAST handles size);
   attachment **blobs do not** — we store metadata + provider attachment id and
   fetch/stream on demand (S3-compatible cache is a later optimization).
6. **Search is a raw-SQL migration**: a generated, weighted `tsvector` column
   on `Message` + GIN index, plus `pg_trgm` indexes on `Contact.name/email`.
   Prisma doesn't model these; they live in `migrations/` as documented SQL.
7. **AI outputs are persisted** in `AiArtifact` (keyed by target + feature +
   prompt version) so summaries/action-items survive Redis restarts and are
   never recomputed for unchanged threads.

## Entity relationship overview

```
User 1─* EmailAccount 1─* Thread 1─* Message 1─* Attachment
  │            │             │*
  │            │             │      *│
  │            └──────1─* Label *──── ThreadLabel
  ├─1─* Session                │
  ├─1─* Contact (per account)  │
  ├─1─1 UserSettings           │
  └─1─* AiArtifact (also linked to Thread/Message)
        FollowUpReminder (User ↔ Thread)
```

## `schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Identity ─────────────────────────

model User {
  id        String   @id @default(cuid())
  email     String   @unique          // primary login identity
  name      String
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  settings  UserSettings?
  accounts  EmailAccount[]
  sessions  Session[]
  labels    Label[]
  artifacts AiArtifact[]
  reminders FollowUpReminder[]

  @@map("users")
}

model UserSettings {
  id                String  @id @default(cuid())
  userId            String  @unique
  theme             Theme   @default(SYSTEM)
  undoWindowSeconds Int     @default(10)     // 0 | 5 | 10 | 30
  aiEnabled         Boolean @default(true)
  aiAutoLabels      Boolean @default(true)
  aiDailyBriefing   Boolean @default(true)
  aiFollowUps       Boolean @default(true)
  briefingHourLocal Int     @default(8)
  timezone          String  @default("UTC")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}

enum Theme {
  LIGHT
  DARK
  SYSTEM
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique          // hash of opaque cookie value
  userAgent String?
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

// ───────────────────── Connected accounts ─────────────────────

enum Provider {
  GOOGLE
  MICROSOFT
}

enum SyncStatus {
  PENDING       // just connected
  BACKFILLING
  ACTIVE
  ERROR
  DISCONNECTED  // token revoked
}

model EmailAccount {
  id                 String     @id @default(cuid())
  userId             String
  provider           Provider
  providerAccountId  String                    // Google sub / MS oid
  email              String
  displayName        String?
  encryptedRefreshToken String                 // AES-256-GCM, base64(iv|tag|ciphertext)
  scopes             String[]
  syncStatus         SyncStatus @default(PENDING)
  syncCursor         String?                   // Gmail historyId / Graph deltaLink
  watchExpiresAt     DateTime?                 // push subscription renewal
  lastSyncedAt       DateTime?
  color              String?                   // account accent in unified inbox
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  threads  Thread[]
  messages Message[]
  contacts Contact[]

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("email_accounts")
}

// ───────────────────────── Mail ─────────────────────────

enum Folder {
  INBOX
  SENT
  DRAFTS
  SPAM
  TRASH
  ARCHIVE
}

model Thread {
  id               String    @id @default(cuid())
  accountId        String
  providerThreadId String
  subject          String    @default("")
  snippet          String    @default("")     // latest message preview
  folder           Folder    @default(INBOX)
  participants     Json      // [{ name, email }] denormalized for list rendering
  messageCount     Int       @default(1)
  unreadCount      Int       @default(0)
  isStarred        Boolean   @default(false)
  isPinned         Boolean   @default(false)  // pinned to top of inbox
  isPriority       Boolean   @default(false)  // AI/user priority flag
  hasAttachments   Boolean   @default(false)
  snoozedUntil     DateTime?                  // non-null ⇒ shown in Snoozed
  lastMessageAt    DateTime
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  account   EmailAccount       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  messages  Message[]
  labels    ThreadLabel[]
  artifacts AiArtifact[]
  reminders FollowUpReminder[]

  @@unique([accountId, providerThreadId])
  // Hot path: folder listing, unified & per-account, newest first
  @@index([accountId, folder, lastMessageAt(sort: Desc)])
  @@index([accountId, snoozedUntil])
  @@index([accountId, isPriority, lastMessageAt(sort: Desc)])
  @@map("threads")
}

enum SendStatus {
  NONE       // received mail
  DRAFT
  QUEUED     // inside undo window or awaiting scheduledAt
  SENDING
  SENT
  FAILED
}

model Message {
  id                String     @id @default(cuid())
  threadId          String
  accountId         String
  providerMessageId String?                    // null until sent/synced
  fromAddress       Json       // { name, email }
  toAddresses       Json       // [{ name, email }]
  ccAddresses       Json       @default("[]")
  bccAddresses      Json       @default("[]")
  replyToMessageId  String?    // in-thread reply parent (RFC 822 In-Reply-To mapping)
  subject           String     @default("")
  snippet           String     @default("")
  bodyHtml          String?    // sanitized on ingest
  bodyText          String?    // plain text for search + AI
  isRead            Boolean    @default(false)
  isDraftReplyAll   Boolean    @default(false)
  sendStatus        SendStatus @default(NONE)
  scheduledAt       DateTime?  // schedule-send target
  sentAt            DateTime?
  receivedAt        DateTime   @default(now())
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  // NOTE: migration adds `search_vector tsvector GENERATED ALWAYS AS (…) STORED`
  //       + GIN index. See "Search migration" below.

  thread      Thread       @relation(fields: [threadId], references: [id], onDelete: Cascade)
  account     EmailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  attachments Attachment[]
  artifacts   AiArtifact[]

  @@unique([accountId, providerMessageId])
  @@index([threadId, receivedAt])
  @@index([accountId, sendStatus, scheduledAt]) // scheduler reconciliation
  @@map("messages")
}

model Attachment {
  id                   String  @id @default(cuid())
  messageId            String
  providerAttachmentId String?               // fetch-on-demand handle
  filename             String
  mimeType             String
  sizeBytes            Int
  storageKey           String?               // set for locally uploaded (outgoing) files
  isInline             Boolean @default(false)
  contentId            String?               // cid: for inline images

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@map("attachments")
}

// ───────────────────────── Labels ─────────────────────────

model Label {
  id              String   @id @default(cuid())
  userId          String
  name            String
  color           String   @default("#6E56CF")
  providerLabelId String?  // mapped Gmail label / Graph category, if mirrored
  createdAt       DateTime @default(now())

  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  threads ThreadLabel[]

  @@unique([userId, name])
  @@map("labels")
}

model ThreadLabel {
  threadId      String
  labelId       String
  isAiSuggested Boolean  @default(false) // smart label awaiting user confirmation
  createdAt     DateTime @default(now())

  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  label  Label  @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([threadId, labelId])
  @@index([labelId])
  @@map("thread_labels")
}

// ───────────────────────── Contacts ─────────────────────────

model Contact {
  id             String   @id @default(cuid())
  accountId      String
  email          String
  name           String?
  interactions   Int      @default(0)   // ranking signal for autocomplete & NL search
  lastInteracted DateTime?

  account EmailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, email])
  // migration adds pg_trgm GIN indexes on name & email
  @@map("contacts")
}

// ───────────────────────── AI ─────────────────────────

enum AiFeature {
  THREAD_SUMMARY
  MESSAGE_SUMMARY
  ACTION_ITEMS      // payload: [{ text, deadline?, done }]
  MEETING_DETECTION // payload: { title, start, end, attendees }
  TRANSLATION       // param: target language
  SMART_LABELS
  DAILY_BRIEFING
  FOLLOW_UP         // detected "awaiting reply" state
}

model AiArtifact {
  id            String    @id @default(cuid())
  userId        String
  threadId      String?
  messageId     String?
  feature       AiFeature
  param         String    @default("")   // e.g. target lang; part of uniqueness
  promptVersion Int
  content       Json                      // feature-shaped payload
  model         String                    // OpenAI model used
  tokensUsed    Int       @default(0)
  createdAt     DateTime  @default(now())

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  thread  Thread?  @relation(fields: [threadId], references: [id], onDelete: Cascade)
  message Message? @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([userId, threadId, messageId, feature, param, promptVersion])
  @@index([threadId, feature])
  @@map("ai_artifacts")
}

model FollowUpReminder {
  id        String    @id @default(cuid())
  userId    String
  threadId  String
  reason    String    // "No reply from Sarah in 3 days"
  remindAt  DateTime
  dismissed Boolean   @default(false)
  createdAt DateTime  @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([userId, remindAt, dismissed])
  @@map("follow_up_reminders")
}
```

## Search migration (raw SQL, alongside Prisma migrations)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE messages ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
  ) STORED;

CREATE INDEX messages_search_idx ON messages USING GIN (search_vector);
CREATE INDEX contacts_name_trgm_idx  ON contacts USING GIN (name  gin_trgm_ops);
CREATE INDEX contacts_email_trgm_idx ON contacts USING GIN (email gin_trgm_ops);
```

Participant matching (`from:john`) resolves through `contacts` (trigram) to
email addresses, then filters messages by JSON containment — keeping the
tsvector small and the ranking clean.

## Redis keyspace (not Prisma, documented for completeness)

| Key pattern | Purpose | TTL |
|---|---|---|
| `sess:{tokenHash}` | session record mirror (fast path) | sliding 30d |
| `oauth:access:{accountId}` | provider access token | provider expiry |
| `ai:cache:{feature}:{hash}` | streamed-result cache | 24h |
| `nl:compile:{queryHash}` | NL→filter compilation | 7d |
| `rate:{userId}:{bucket}` | token buckets (ai, search, send) | window |
| BullMQ queues | `sync`, `send`, `snooze`, `ai-bg` | — |
```
