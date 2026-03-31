import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CLAIM_WINDOW_MS = 90 * 60 * 1000; // 90 minutes

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? "50"), 10);
  if (Number.isNaN(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 500));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const campaignId = (url.searchParams.get("campaignId") ?? "").trim();

    // Leads claimed within the last 90 minutes are excluded — they are either
    // actively being processed or were mid-flight when automation stopped.
    // After 90 minutes the claim expires and the lead becomes eligible again.
    const claimCutoff = new Date(Date.now() - CLAIM_WINDOW_MS);

    // Atomically select + claim using an interactive transaction.
    // SELECT ... FOR UPDATE SKIP LOCKED means two concurrent runners can never
    // receive the same lead — the second caller skips any rows locked by the first.
    const claimedIds = await prisma.$transaction(async (tx) => {
      const campaignFilter = campaignId
        ? Prisma.sql`AND "campaignId" = ${campaignId}`
        : Prisma.empty;

      const eligible = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "lead"
        WHERE status = 'pending'
          AND replied = false
          AND ("claimedAt" IS NULL OR "claimedAt" < ${claimCutoff})
        ${campaignFilter}
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (eligible.length === 0) return [];

      const ids = eligible.map((r) => r.id);

      // Stamp claimedAt inside the same transaction — atomically with the SELECT.
      await tx.lead.updateMany({
        where: { id: { in: ids } },
        data: { claimedAt: new Date() },
      });

      return ids;
    });

    if (claimedIds.length === 0) {
      return NextResponse.json({ success: true, count: 0, leads: [] });
    }

    console.log(`[send-queue] Claimed ${claimedIds.length} lead(s) atomically. Lock expires in ${CLAIM_WINDOW_MS / 60000} min.`);

    // Fetch full lead data for the claimed IDs (outside the transaction — no lock needed).
    const leads = await prisma.lead.findMany({
      where: { id: { in: claimedIds } },
      orderBy: { createdAt: "asc" },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            subject: true,
            body: true,
            followup1: true,
            followup2: true,
            signature: true,
            chatGptChatId: true,
            gmailAuthUser: true,
          },
        },
      },
    });

    const queue = leads.map((lead, index) => {
      const authUserRaw = lead.campaign.gmailAuthUser ?? "";
      const accounts = authUserRaw.split(",").map((s) => s.trim()).filter(Boolean);

      // Rotate through accounts if multiple are provided
      let selectedAuthUser = authUserRaw;
      if (accounts.length > 1) {
        selectedAuthUser = accounts[index % accounts.length];
      } else if (accounts.length === 1) {
        selectedAuthUser = accounts[0];
      }

      return {
        leadId: lead.id,
        campaignId: lead.campaignId,
        campaignName: lead.campaign.name,
        campaignChatId: lead.campaign.chatGptChatId ?? "",
        campaignGmailAuthUser: selectedAuthUser || "",
        gmailThreadId: lead.gmailThreadId ?? "",
        recipientName: lead.recipientName,
        recipientEmail: lead.recipientEmail,
        websiteUrl: lead.websiteUrl ?? "",
        website: lead.websiteUrl ?? "",
        niche: lead.niche ?? "",
        step: lead.step,
        campaignBody: lead.campaign.body ?? "",
        campaignSubject: lead.campaign.subject ?? "",
        followup1: lead.campaign.followup1 ?? "",
        followup2: lead.campaign.followup2 ?? "",
        campaignSignature: lead.campaign.signature ?? "",
      };
    });

    return NextResponse.json({
      success: true,
      count: queue.length,
      leads: queue,
    });
  } catch (error) {
    console.error("Error building send queue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build send queue" },
      { status: 500 }
    );
  }
}
