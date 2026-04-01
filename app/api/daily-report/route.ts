import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");

    let start: Date;
    let end: Date;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [year, month, day] = dateParam.split("-").map(Number);
      start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      const now = new Date();
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    }

    const leads = await prisma.lead.findMany({
      where: {
        sentAt: { gte: start, lte: end },
        status: { in: ["sent", "scheduled", "replied"] },
      },
      select: {
        sentGmailAuthUser: true,
        status: true,
        step: true,
      },
    });

    // Per-sender breakdown with step split
    const senderMap: Record<string, { total: number; initial: number; followup1: number; followup2: number }> = {};
    let totalInitial = 0;
    let totalFollowup1 = 0;
    let totalFollowup2 = 0;

    for (const lead of leads) {
      const sender = lead.sentGmailAuthUser?.trim() || "Unknown";
      if (!senderMap[sender]) senderMap[sender] = { total: 0, initial: 0, followup1: 0, followup2: 0 };

      senderMap[sender].total++;

      if (lead.step <= 1) {
        senderMap[sender].initial++;
        totalInitial++;
      } else if (lead.step === 2) {
        senderMap[sender].followup1++;
        totalFollowup1++;
      } else {
        senderMap[sender].followup2++;
        totalFollowup2++;
      }
    }

    const senders = Object.entries(senderMap)
      .map(([email, s]) => ({ email, count: s.total, initial: s.initial, followup1: s.followup1, followup2: s.followup2 }))
      .sort((a, b) => b.count - a.count);

    const total = leads.length;

    return NextResponse.json({
      success: true,
      date: start.toISOString().slice(0, 10),
      total,
      totalInitial,
      totalFollowup1,
      totalFollowup2,
      senders,
    });
  } catch (error) {
    console.error("Daily report error:", error);
    return NextResponse.json({ success: false, error: "Failed to load daily report" }, { status: 500 });
  }
}
