-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "subject" TEXT,
    "emailBody" TEXT,
    "followup1" TEXT,
    "followup2" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "step" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "nextFollowup" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
