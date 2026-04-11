import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? "50"), 10);
  if (Number.isNaN(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 500));
}

function resolveFollowupBody(
  step: number,
  followup1: string | null,
  followup2: string | null,
  followup1Templates: string[]
): string {
  if (step === 1) {
    const legacy = String(followup1 ?? "").trim();
    if (legacy) return legacy;
    return followup1Templates.length > 0 ? followup1Templates[0] : "";
  }
  if (step === 2) {
    return String(followup2 ?? "").trim();
  }
  return "";
}

async function resolveGmailAccountIndex(
  gmailFollowupEmail: string | null,
  gmailAccountIndex: number | null
): Promise<string> {
  if (gmailFollowupEmail) {
    const mapRow = await prisma.gmailAccountMap.findUnique({
      where: { email: gmailFollowupEmail.toLowerCase() },
    });
    if (mapRow != null) {
      return String(mapRow.accountIndex);
    }
  }
  if (gmailAccountIndex != null) {
    return String(gmailAccountIndex);
  }
  return "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const campaignId = (url.searchParams.get("campaignId") ?? "").trim();
    const stepParam = url.searchParams.get("step");
    const step = stepParam ? parseInt(stepParam, 10) : null;

    const where: Prisma.LeadWhereInput = {
      status: "sent",
      replied: false,
      unsubscribed: false,
      step: step !== null ? step : { lt: 3 },
      nextFollowup: { lte: new Date() },
    };
    if (campaignId) {
      where.campaignId = campaignId;
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { nextFollowup: "asc" },
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
            followup1Templates: true,
            signature: true,
            chatGptChatId: true,
            gmailAuthUser: true,
            gmailAccountIndex: true,
            gmailFollowupEmail: true,
          },
        },
      },
    });

    const queue = await Promise.all(
      leads.map(async (lead) => {
        let followup1Templates: string[] = [];
        try {
          const parsed = JSON.parse(lead.campaign.followup1Templates ?? "[]");
          if (Array.isArray(parsed)) {
            followup1Templates = parsed.map(String).filter(Boolean);
          }
        } catch {
          followup1Templates = [];
        }
        const followupBody = resolveFollowupBody(lead.step, lead.campaign.followup1, lead.campaign.followup2, followup1Templates);
        const campaignGmailAccountIndex = await resolveGmailAccountIndex(
          lead.campaign.gmailFollowupEmail,
          lead.campaign.gmailAccountIndex
        );
        const campaignGmailAuthUser =
          lead.campaign.gmailFollowupEmail ||
          lead.sentGmailAuthUser ||
          (lead.campaign.gmailAuthUser ?? "").split(",")[0].trim() ||
          "";
        return {
          leadId: lead.id,
          campaignId: lead.campaignId,
          campaignName: lead.campaign.name,
          campaignChatId: lead.campaign.chatGptChatId ?? "",
          campaignGmailAuthUser,
          campaignGmailAccountIndex,
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
          followup1Templates,
          campaignSignature: lead.campaign.signature ?? "",
          followupBody,
        };
      })
    );

    const filtered = queue.filter((item) => item.followupBody !== "");

    return NextResponse.json({
      success: true,
      count: filtered.length,
      leads: filtered,
    });
  } catch (error) {
    console.error("Error building followup queue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build followup queue" },
      { status: 500 }
    );
  }
}
