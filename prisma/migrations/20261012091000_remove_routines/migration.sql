-- Routines were replaced by habits (see 20261012090000_add_habits). This
-- permanently deletes every routine, step, and run.

-- DropForeignKey
ALTER TABLE "RoutineRun" DROP CONSTRAINT "RoutineRun_routineId_fkey";

-- DropForeignKey
ALTER TABLE "RoutineStep" DROP CONSTRAINT "RoutineStep_routineId_fkey";

-- DropForeignKey
ALTER TABLE "Routine" DROP CONSTRAINT "Routine_userId_fkey";

-- DropTable
DROP TABLE "RoutineRun";

-- DropTable
DROP TABLE "RoutineStep";

-- DropTable
DROP TABLE "Routine";
