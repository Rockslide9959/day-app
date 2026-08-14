-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "itemType" TEXT NOT NULL DEFAULT 'event';
