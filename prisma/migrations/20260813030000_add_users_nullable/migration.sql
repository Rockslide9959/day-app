-- Adds multi-user accounts. userId columns are added NULLABLE here so
-- existing rows aren't broken; a follow-up migration
-- (20260813040000_require_users) enforces NOT NULL + foreign keys once
-- a one-off backfill script has assigned every existing row to an owner.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "userId" TEXT;
-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN "userId" TEXT;
-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "userId" TEXT;
-- AlterTable
ALTER TABLE "Routine" ADD COLUMN "userId" TEXT;
-- AlterTable
ALTER TABLE "EventCategory" ADD COLUMN "userId" TEXT;
-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");
CREATE INDEX "ScheduleItem_userId_idx" ON "ScheduleItem"("userId");
CREATE INDEX "Todo_userId_idx" ON "Todo"("userId");
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- EventCategory names become unique per-user instead of globally unique.
DROP INDEX IF EXISTS "EventCategory_name_key";
