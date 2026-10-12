-- The standalone Reminders and Timers features were removed from the app.
-- This permanently deletes every reminder and timer. (Event reminders on
-- ScheduleItem and the daily to-do reminder are unaffected.)

-- DropForeignKey
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_userId_fkey";

-- DropForeignKey
ALTER TABLE "Timer" DROP CONSTRAINT "Timer_userId_fkey";

-- DropTable
DROP TABLE "Reminder";

-- DropTable
DROP TABLE "Timer";
