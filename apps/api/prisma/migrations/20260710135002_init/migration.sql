-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'BACKFILLING', 'ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "Folder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'SPAM', 'TRASH', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('NONE', 'DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('THREAD_SUMMARY', 'MESSAGE_SUMMARY', 'ACTION_ITEMS', 'MEETING_DETECTION', 'TRANSLATION', 'SMART_LABELS', 'DAILY_BRIEFING', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "undoWindowSeconds" INTEGER NOT NULL DEFAULT 10,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiAutoLabels" BOOLEAN NOT NULL DEFAULT true,
    "aiDailyBriefing" BOOLEAN NOT NULL DEFAULT true,
    "aiFollowUps" BOOLEAN NOT NULL DEFAULT true,
    "briefingHourLocal" INTEGER NOT NULL DEFAULT 8,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncCursor" TEXT,
    "watchExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "folder" "Folder" NOT NULL DEFAULT 'INBOX',
    "participants" JSONB NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "fromAddress" JSONB NOT NULL,
    "toAddresses" JSONB NOT NULL,
    "ccAddresses" JSONB NOT NULL DEFAULT '[]',
    "bccAddresses" JSONB NOT NULL DEFAULT '[]',
    "replyToMessageId" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDraftReplyAll" BOOLEAN NOT NULL DEFAULT false,
    "sendStatus" "SendStatus" NOT NULL DEFAULT 'NONE',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "providerAttachmentId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "contentId" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6E56CF',
    "providerLabelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_labels" (
    "threadId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "isAiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_labels_pkey" PRIMARY KEY ("threadId","labelId")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "lastInteracted" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "messageId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "param" TEXT NOT NULL DEFAULT '',
    "promptVersion" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "email_accounts_userId_idx" ON "email_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_provider_providerAccountId_key" ON "email_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "threads_accountId_folder_lastMessageAt_idx" ON "threads"("accountId", "folder", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "threads_accountId_snoozedUntil_idx" ON "threads"("accountId", "snoozedUntil");

-- CreateIndex
CREATE INDEX "threads_accountId_isPriority_lastMessageAt_idx" ON "threads"("accountId", "isPriority", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "threads_accountId_providerThreadId_key" ON "threads"("accountId", "providerThreadId");

-- CreateIndex
CREATE INDEX "messages_threadId_receivedAt_idx" ON "messages"("threadId", "receivedAt");

-- CreateIndex
CREATE INDEX "messages_accountId_sendStatus_scheduledAt_idx" ON "messages"("accountId", "sendStatus", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_accountId_providerMessageId_key" ON "messages"("accountId", "providerMessageId");

-- CreateIndex
CREATE INDEX "attachments_messageId_idx" ON "attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_userId_name_key" ON "labels"("userId", "name");

-- CreateIndex
CREATE INDEX "thread_labels_labelId_idx" ON "thread_labels"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_accountId_email_key" ON "contacts"("accountId", "email");

-- CreateIndex
CREATE INDEX "ai_artifacts_threadId_feature_idx" ON "ai_artifacts"("threadId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "ai_artifacts_userId_threadId_messageId_feature_param_prompt_key" ON "ai_artifacts"("userId", "threadId", "messageId", "feature", "param", "promptVersion");

-- CreateIndex
CREATE INDEX "follow_up_reminders_userId_remindAt_dismissed_idx" ON "follow_up_reminders"("userId", "remindAt", "dismissed");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_labels" ADD CONSTRAINT "thread_labels_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_labels" ADD CONSTRAINT "thread_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
