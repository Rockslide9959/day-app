-- Finalizes multi-user support now that the backfill script has assigned
-- every existing row to an owner: enforce NOT NULL, add foreign keys
-- (cascading deletes so removing an account cleans up its data), and
-- make EventCategory names unique per-user instead of globally.

-- AlterTable: require userId
ALTER TABLE "Reminder" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ScheduleItem" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Todo" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Routine" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "EventCategory" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: category names unique per-user now, not globally
CREATE UNIQUE INDEX "EventCategory_userId_name_key" ON "EventCategory"("userId", "name");
