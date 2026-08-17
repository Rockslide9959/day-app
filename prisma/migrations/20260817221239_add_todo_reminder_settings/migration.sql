-- AlterTable
ALTER TABLE "User" ADD COLUMN     "todoReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "todoReminderLastSentDate" TEXT,
ADD COLUMN     "todoReminderTime" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "todoReminderTimeZone" TEXT;
