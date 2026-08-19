-- AlterTable
ALTER TABLE "attachments" DROP COLUMN "storageKey",
ADD COLUMN     "content" BYTEA;
