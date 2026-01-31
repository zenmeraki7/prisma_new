/*
  Warnings:

  - Added the required column `sortKey` to the `SnapshotProduct` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SnapshotProduct" DROP COLUMN "sortKey",
ADD COLUMN     "sortKey" INTEGER NOT NULL;
