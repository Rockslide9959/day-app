-- The "Reminder" option on calendar events and tasks was removed from the app.
-- This permanently deletes every event/task reminder setting
-- (ScheduleItem."reminderMinutesBefore") and all reminder delivery history
-- (the "ScheduleReminderDelivery" table). The daily to-do reminder and push
-- subscriptions are unaffected.

-- DropForeignKey
ALTER TABLE "ScheduleReminderDelivery" DROP CONSTRAINT "ScheduleReminderDelivery_scheduleItemId_fkey";

-- DropTable
DROP TABLE "ScheduleReminderDelivery";

-- AlterTable
ALTER TABLE "ScheduleItem" DROP COLUMN "reminderMinutesBefore";
