-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "timeZone" TEXT;

-- CreateTable
CREATE TABLE "ScheduleReminderDelivery" (
    "id" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3) NOT NULL,
    "pushEndpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleReminderDelivery_scheduleItemId_occurrenceDate_idx" ON "ScheduleReminderDelivery"("scheduleItemId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "ScheduleReminderDelivery_status_reminderAt_idx" ON "ScheduleReminderDelivery"("status", "reminderAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleReminderDelivery_scheduleItemId_occurrenceDate_push_key" ON "ScheduleReminderDelivery"("scheduleItemId", "occurrenceDate", "pushEndpoint");

-- AddForeignKey
ALTER TABLE "ScheduleReminderDelivery" ADD CONSTRAINT "ScheduleReminderDelivery_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
