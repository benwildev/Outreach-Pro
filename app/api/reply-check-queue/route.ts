import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || "30");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

    const leads = await prisma.lead.findMany({
      where: {
        status: "sent",
        replied: false,
        AND: [
          { gmailThreadId: { not: null } },
          { gmailThreadId: { not: "" } },
        ],
      },
      include: {
        campaign: true,
      },
      orderBy: [{ sentAt: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    const normalizedLeads = leads.map((lead) => ({
      id: lead.id,
      recipientEmail: lead.recipientEmail,
      gmailThreadId: lead.gmailThreadId,
      campaignGmailAuthUser: lead.sentGmailAuthUser || (lead.campaign?.gmailAuthUser ?? "").split(",")[0].trim() || "",
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
