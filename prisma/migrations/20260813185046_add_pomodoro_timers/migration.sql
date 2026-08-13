-- AlterTable
ALTER TABLE "Timer" ADD COLUMN     "breakSeconds" INTEGER,
ADD COLUMN     "cyclesCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "workSeconds" INTEGER;
