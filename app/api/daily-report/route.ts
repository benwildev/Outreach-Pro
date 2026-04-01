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
        sentAt: {
          gte: start,
          lte: end,
        },
        status: { in: ["sent", "scheduled", "replied"] },
      },
      select: {
        sentGmailAuthUser: true,
        status: true,
      },
    });

    const senderMap: Record<string, number> = {};
    for (const lead of leads) {
      const sender = lead.sentGmailAuthUser?.trim() || "Unknown";
      senderMap[sender] = (senderMap[sender] ?? 0) + 1;
    }

    const senders = Object.entries(senderMap)
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count);

    const total = leads.length;

    return NextResponse.json({ success: true, date: start.toISOString().slice(0, 10), total, senders });
  } catch (error) {
    console.error("Daily report error:", error);
    return NextResponse.json({ success: false, error: "Failed to load daily report" }, { status: 500 });
  }
}
