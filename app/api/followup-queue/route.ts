import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { promoteScheduledLeads } from "@/lib/promoteScheduledLeads";

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

export async function GET(request: Request) {
  try {
    await promoteScheduledLeads();
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const campaignId = (url.searchParams.get("campaignId") ?? "").trim();
    const stepParam = url.searchParams.get("step");
    const step = stepParam ? parseInt(stepParam, 10) : null;
    const fu1GmailOverride = (url.searchParams.get("fu1GmailOverride") ?? "").trim();
    const gmailAcct = (url.searchParams.get("gmailAcct") ?? "").trim();

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
    if (gmailAcct) {
      where.sentGmailAuthUser = { contains: gmailAcct, mode: "insensitive" };
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
            gmailFollowup2Email: true,
          },
        },
      },
    });

    // Batch-load account map for all distinct follow-up emails (FU1 + FU2 + override + sentGmailAuthUser) in one query.
    const allFollowupEmails = Array.from(
      new Set(
        [
          ...leads.flatMap((l) => [
            l.campaign.gmailFollowupEmail,
            l.campaign.gmailFollowup2Email,
            l.sentGmailAuthUser,
          ]),
          fu1GmailOverride || null,
        ].filter((e): e is string => !!e)
      )
    );
    const accountMapRows = allFollowupEmails.length > 0
      ? await prisma.gmailAccountMap.findMany({ where: { email: { in: allFollowupEmails } } })
      : [];
    const accountIndexByEmail = new Map(accountMapRows.map((r) => [r.email, r.accountIndex]));

    const queue = leads
      .map((lead) => {
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

        // Determine the effective sending account for this lead.
        const isStep1Lead = lead.step === 1;
        const effectiveFu1Email = isStep1Lead && fu1GmailOverride ? fu1GmailOverride : null;
        const stepEmail = isStep1Lead
          ? (effectiveFu1Email || lead.campaign.gmailFollowupEmail)
          : (lead.campaign.gmailFollowup2Email || lead.campaign.gmailFollowupEmail);

        const followupEmail = stepEmail ?? null;
        let campaignGmailAccountIndex = "";
        if (followupEmail) {
          const mapped = accountIndexByEmail.get(followupEmail);
          campaignGmailAccountIndex = mapped != null ? String(mapped) : "";
        } else if (lead.campaign.gmailAccountIndex != null) {
          campaignGmailAccountIndex = String(lead.campaign.gmailAccountIndex);
        }

        const campaignGmailAuthUser =
          followupEmail ||
          lead.sentGmailAuthUser ||
          (lead.campaign.gmailAuthUser ?? "").split(",")[0].trim() ||
          "";

        // Always use only the first email address — the field may contain multiple
        // comma/semicolon-separated addresses from import; sending to all would cause failures.
        const recipientEmail = (lead.recipientEmail ?? "")
          .split(/[,;]/)
          .map((e) => e.trim())
          .filter(Boolean)[0] ?? "";

        return {
          leadId: lead.id,
          campaignId: lead.campaignId,
          campaignName: lead.campaign.name,
          campaignChatId: lead.campaign.chatGptChatId ?? "",
          campaignGmailAuthUser,
          campaignGmailAccountIndex,
          gmailThreadId: lead.gmailThreadId ?? "",
          recipientName: lead.recipientName,
          recipientEmail,
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
      .filter((item) => item.followupBody !== "");

    return NextResponse.json({
      success: true,
      count: queue.length,
      leads: queue,
    });
  } catch (error) {
    console.error("Error building followup queue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build followup queue" },
      { status: 500 }
    );
  }
}
