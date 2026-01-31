/*
  Warnings:

  - Changed the type of `sortKey` on the `SnapshotProduct` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SnapshotProduct" DROP COLUMN "sortKey",
ADD COLUMN     "sortKey" TIMESTAMP(3) NOT NULL;
