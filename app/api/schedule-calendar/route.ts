import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getUTCFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getUTCMonth() + 1;

    const rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { sentAt: { gte: rangeStart, lte: rangeEnd } },
          {
            nextFollowup: { gte: rangeStart, lte: rangeEnd },
            status: { in: ["scheduled", "pending"] },
          },
        ],
      },
      select: {
        sentAt: true,
        nextFollowup: true,
        status: true,
        step: true,
        replied: true,
        sentGmailAuthUser: true,
      },
    });

    const days: Record<string, {
      sent: number;
      scheduled: number;
      followup1: number;
      followup2: number;
      replied: number;
      futureScheduled: number;
    }> = {};

    const todayStr = dayKey(now);

    const getDay = (key: string) => {
      if (!days[key]) {
        days[key] = { sent: 0, scheduled: 0, followup1: 0, followup2: 0, replied: 0, futureScheduled: 0 };
      }
      return days[key];
    };

    for (const lead of leads) {
      const step = lead.step ?? 1;

      // Historical: lead was actually sent on a date in this month
      if (lead.sentAt) {
        const k = dayKey(lead.sentAt);
        const d = getDay(k);
        if (lead.status === "scheduled") {
          d.scheduled++;
        } else if (["sent", "replied", "bounced", "failed"].includes(lead.status)) {
          if (step <= 1) d.sent++;
          else if (step === 2) d.followup1++;
          else d.followup2++;
          if (lead.replied) d.replied++;
        }
      }

      // Future/upcoming: lead has a nextFollowup in this month and is pending/scheduled
      if (lead.nextFollowup && (lead.status === "scheduled" || lead.status === "pending")) {
        const k = dayKey(lead.nextFollowup);
        if (k > todayStr) {
          getDay(k).futureScheduled++;
        }
      }
    }

    return NextResponse.json({ success: true, year, month, days });
  } catch (error) {
    console.error("Schedule calendar error:", error);
    return NextResponse.json({ success: false, error: "Failed to load calendar data" }, { status: 500 });
  }
}
