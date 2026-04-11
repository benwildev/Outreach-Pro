import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    const rawLimit = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    const leads = await prisma.lead.findMany({
      where: {
        status: "sent",
        replied: false,
        sentAt: { lte: new Date() },
        AND: [
          { gmailThreadId: { not: null } },
          { gmailThreadId: { not: "" } },
        ],
      },
      include: {
        campaign: {
          select: {
            gmailAuthUser: true,
            gmailAccountIndex: true,
            gmailFollowupEmail: true,
          },
        },
      },
      orderBy: [{ lastReplyCheckedAt: "asc" }, { sentAt: "asc" }],
      take: limit,
    });

    const normalizedLeads = await Promise.all(
      leads.map(async (lead) => {
        const campaignGmailAccountIndex = await resolveGmailAccountIndex(
          lead.campaign?.gmailFollowupEmail ?? null,
          lead.campaign?.gmailAccountIndex ?? null
        );
        const campaignGmailAuthUser =
          lead.campaign?.gmailFollowupEmail ||
          lead.sentGmailAuthUser ||
          (lead.campaign?.gmailAuthUser ?? "").split(",")[0].trim() ||
          "";
        return {
          id: lead.id,
          recipientEmail: lead.recipientEmail,
          gmailThreadId: lead.gmailThreadId,
          campaignGmailAuthUser,
          campaignGmailAccountIndex,
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: normalizedLeads.length,
      leads: normalizedLeads,
    });
  } catch (error) {
    console.error("Error building reply-check queue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build reply-check queue" },
      { status: 500 }
    );
  }
}
