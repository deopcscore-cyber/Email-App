-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signatures_accountId_key" ON "signatures"("accountId");

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
