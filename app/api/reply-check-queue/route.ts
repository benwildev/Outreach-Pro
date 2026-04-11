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
        // Only check leads whose email has already been delivered (sentAt <= now).
        sentAt: { lte: new Date() },
        AND: [
          { gmailThreadId: { not: null } },
          { gmailThreadId: { not: "" } },
        ],
      },
      include: {
        campaign: true,
      },
      // Leads never checked come first (null → least recent), then the
      // least-recently-checked so we rotate fairly across all 500-1000 leads.
      orderBy: [{ lastReplyCheckedAt: "asc" }, { sentAt: "asc" }],
      take: limit,
    });

    const normalizedLeads = leads.map((lead) => ({
      id: lead.id,
      recipientEmail: lead.recipientEmail,
      gmailThreadId: lead.gmailThreadId,
      campaignGmailAuthUser: lead.sentGmailAuthUser || (lead.campaign?.gmailAuthUser ?? "").split(",")[0].trim() || "",
      campaignGmailAccountIndex: lead.campaign?.gmailAccountIndex != null ? String(lead.campaign.gmailAccountIndex) : "",
    }));

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
