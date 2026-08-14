-- CreateTable
CREATE TABLE "NotebookEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "entryType" TEXT NOT NULL DEFAULT 'note',
    "journalDate" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotebookEntry_userId_idx" ON "NotebookEntry"("userId");

-- CreateIndex
CREATE INDEX "NotebookEntry_userId_updatedAt_idx" ON "NotebookEntry"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "NotebookEntry_userId_entryType_idx" ON "NotebookEntry"("userId", "entryType");

-- CreateIndex
CREATE INDEX "NotebookEntry_userId_journalDate_idx" ON "NotebookEntry"("userId", "journalDate");

-- CreateIndex
CREATE UNIQUE INDEX "NotebookEntry_userId_journalDate_key" ON "NotebookEntry"("userId", "journalDate");

-- AddForeignKey
ALTER TABLE "NotebookEntry" ADD CONSTRAINT "NotebookEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
