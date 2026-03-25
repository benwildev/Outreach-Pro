-- AlterTable: add googleSheetId to campaign
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "googleSheetId" TEXT;

-- CreateTable: import_log
CREATE TABLE IF NOT EXISTS "import_log" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "startRow" INTEGER NOT NULL,
    "endRow" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "import_log" ADD CONSTRAINT "import_log_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
