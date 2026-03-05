import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

    const where: Prisma.LeadWhereInput = {
      status: "pending",
      replied: false,
    };
    if (campaignId) {
      where.campaignId = campaignId;
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
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

    const queue = leads.map((lead) => ({
      leadId: lead.id,
      campaignId: lead.campaignId,
      campaignName: lead.campaign.name,
      campaignChatId: lead.campaign.chatGptChatId ?? "",
      campaignGmailAuthUser: lead.campaign.gmailAuthUser ?? "",
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
    }));

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
