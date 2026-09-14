-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "rolledOver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rolledOverFromDate" TEXT;
