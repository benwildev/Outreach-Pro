-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "followup1" TEXT,
    "followup2" TEXT,
    "delay1Days" INTEGER NOT NULL DEFAULT 3,
    "delay2Days" INTEGER NOT NULL DEFAULT 3,
    "provider" TEXT NOT NULL DEFAULT 'gmail_manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- Create default campaign for existing leads
INSERT INTO "Campaign" ("id", "name", "subject", "body", "delay1Days", "delay2Days", "provider")
VALUES ('migrated_default', 'Migrated Leads', 'Follow up', 'Email body', 3, 3, 'gmail_manual');

-- Add campaignId to Lead (nullable first)
ALTER TABLE "Lead" ADD COLUMN "campaignId" TEXT;

-- Backfill existing leads
UPDATE "Lead" SET "campaignId" = 'migrated_default' WHERE "campaignId" IS NULL;

-- Make campaignId required
ALTER TABLE "Lead" ALTER COLUMN "campaignId" SET NOT NULL;

-- Add foreign key
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old columns from Lead
ALTER TABLE "Lead" DROP COLUMN "senderEmail",
DROP COLUMN "websiteUrl",
DROP COLUMN "subject",
DROP COLUMN "emailBody",
DROP COLUMN "followup1",
DROP COLUMN "followup2",
DROP COLUMN "provider";
