-- AlterTable
ALTER TABLE "BulkEditJob" ADD COLUMN     "compiledWhereJson" JSONB,
ADD COLUMN     "rawFilterExprJson" JSONB,
ADD COLUMN     "selectionMode" TEXT;
