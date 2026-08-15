-- AlterTable
ALTER TABLE "NotebookEntry" ADD COLUMN     "contentFormat" TEXT NOT NULL DEFAULT 'plain',
ADD COLUMN     "richContent" JSONB;
