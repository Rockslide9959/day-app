-- Adds standalone calendar features to ScheduleItem (priority, recurrence,
-- completion, study fields) and a small EventCategory table for custom
-- categories. Purely additive — no existing columns or data are touched.

-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "allDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedDates" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "estimatedHours" DOUBLE PRECISION,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "recurrenceDays" TEXT,
ADD COLUMN     "recurrenceEndDate" TEXT,
ADD COLUMN     "reminderMinutesBefore" INTEGER,
ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_name_key" ON "EventCategory"("name");
