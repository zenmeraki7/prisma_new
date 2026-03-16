-- AlterTable
ALTER TABLE "BulkEditJobItem" ADD COLUMN     "inputLineNumber" INTEGER;

-- CreateIndex
CREATE INDEX "BulkEditJobItem_jobId_inputLineNumber_idx" ON "BulkEditJobItem"("jobId", "inputLineNumber");
