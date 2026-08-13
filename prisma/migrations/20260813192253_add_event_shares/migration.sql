-- CreateTable
CREATE TABLE "EventShare" (
    "id" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventShare_token_key" ON "EventShare"("token");

-- CreateIndex
CREATE INDEX "EventShare_scheduleItemId_idx" ON "EventShare"("scheduleItemId");

-- CreateIndex
CREATE INDEX "EventShare_createdByUserId_idx" ON "EventShare"("createdByUserId");

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
