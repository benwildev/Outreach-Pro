import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

    const followupEmails = Array.from(
      new Set(leads.map((l) => l.campaign?.gmailFollowupEmail).filter((e): e is string => !!e))
    );
    const accountMapRows = followupEmails.length > 0
      ? await prisma.gmailAccountMap.findMany({ where: { email: { in: followupEmails } } })
      : [];
    const accountIndexByEmail = new Map(accountMapRows.map((r) => [r.email, r.accountIndex]));

    const normalizedLeads = leads.map((lead) => {
      const followupEmail = lead.campaign?.gmailFollowupEmail ?? null;
      let campaignGmailAccountIndex = "";
      if (followupEmail) {
        const mapped = accountIndexByEmail.get(followupEmail);
        campaignGmailAccountIndex = mapped != null ? String(mapped) : "";
      } else if (lead.campaign?.gmailAccountIndex != null) {
        campaignGmailAccountIndex = String(lead.campaign.gmailAccountIndex);
      }

      const campaignGmailAuthUser =
        followupEmail ||
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
    });

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
