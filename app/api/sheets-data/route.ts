import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { promoteScheduledLeads } from "@/lib/promoteScheduledLeads";

export async function GET(req: NextRequest) {
  await promoteScheduledLeads();

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, googleSheetId: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    select: {
      recipientEmail: true,
      recipientName: true,
      status: true,
      replied: true,
      sentAt: true,
      sentGmailAuthUser: true,
      gmailThreadId: true,
      replyBody: true,
      nextFollowup: true,
      step: true,
      websiteUrl: true,
      niche: true,
    },
  });

  const rows = leads.map((l) => ({
    email: l.recipientEmail.split(",")[0].trim(),
    name: l.recipientName,
    status: l.status,
    replied: l.replied ? "Yes" : "No",
    sentAt: l.sentAt ? new Date(l.sentAt).toISOString() : "",
    sentFrom: l.sentGmailAuthUser ?? "",
    gmailThreadId: l.gmailThreadId ?? "",
    gmailLink: l.gmailThreadId && l.sentGmailAuthUser
      ? `https://mail.google.com/mail/u/${l.sentGmailAuthUser}/#all/${l.gmailThreadId}`
      : "",
    replyPreview: l.replyBody ? l.replyBody.slice(0, 200) : "",
    nextFollowup: l.nextFollowup ? new Date(l.nextFollowup).toISOString() : "",
    step: l.step,
    websiteUrl: l.websiteUrl ?? "",
    niche: l.niche ?? "",
  }));

  return NextResponse.json({
    campaign: { id: campaign.id, name: campaign.name, googleSheetId: campaign.googleSheetId },
    totalLeads: rows.length,
    exportedAt: new Date().toISOString(),
    leads: rows,
  });
}
