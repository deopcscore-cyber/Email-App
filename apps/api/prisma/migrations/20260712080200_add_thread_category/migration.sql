-- CreateEnum
CREATE TYPE "Category" AS ENUM ('PRIMARY', 'SOCIAL', 'PROMOTIONS');

-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "category" "Category" NOT NULL DEFAULT 'PRIMARY';

-- CreateIndex
CREATE INDEX "threads_accountId_category_lastMessageAt_idx" ON "threads"("accountId", "category", "lastMessageAt" DESC);
