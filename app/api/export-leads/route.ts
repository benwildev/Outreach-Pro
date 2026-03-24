import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function escCsv(val: string | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const filter = searchParams.get("filter");
  const campaignId = searchParams.get("campaign");
  const emailSearch = searchParams.get("email");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const VALID_STATUSES = ["pending", "sent", "replied", "bounced"];
  const isFollowUpDueFilter = filter === "followup-due";
  const where: Prisma.LeadWhereInput = {};

  if (campaignId) where.campaignId = campaignId;

  if (isFollowUpDueFilter) {
    where.status = "sent";
    where.nextFollowup = { lte: new Date() };
  } else if (status && VALID_STATUSES.includes(status)) {
    where.status = status;
  }

  if (emailSearch) {
    where.email = { contains: emailSearch, mode: "insensitive" };
  }

  if (dateFrom || dateTo) {
    const sentAtFilter: Prisma.DateTimeNullableFilter = {};
    if (dateFrom) sentAtFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) sentAtFilter.lte = new Date(dateTo + "T23:59:59");
    where.sentAt = sentAtFilter;
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { campaign: { select: { name: true } } },
  });

  const header = [
    "Campaign", "Recipient Name", "Recipient Email", "Email",
    "Website URL", "Niche", "Status", "Step",
    "Sent At", "Sent Gmail Account", "Gmail Thread ID",
    "Reply Body", "Next Followup", "Created At",
  ].join(",");

  const rows = leads.map((l) =>
    [
      escCsv(l.campaign.name),
      escCsv(l.recipientName),
      escCsv(l.recipientEmail),
      escCsv(l.email),
      escCsv(l.websiteUrl),
      escCsv(l.niche),
      escCsv(l.status),
      String(l.step),
      l.sentAt ? new Date(l.sentAt).toISOString() : "",
      escCsv(l.sentGmailAuthUser),
      escCsv(l.gmailThreadId),
      escCsv(l.replyBody),
      l.nextFollowup ? new Date(l.nextFollowup).toISOString() : "",
      new Date(l.createdAt).toISOString(),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
