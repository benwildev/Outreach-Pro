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
    const todayStr = dayKey(now);
    const year = yearParam ? parseInt(yearParam) : now.getUTCFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getUTCMonth() + 1;

    const rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Fetch leads where:
    // - sentAt is in this month (historical + bulk-queued with explicit send date)
    // - OR nextFollowup is in this month's FUTURE range (auto-follow-ups)
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { sentAt: { gte: rangeStart, lte: rangeEnd } },
          {
            nextFollowup: { gt: now, lte: rangeEnd },
          },
        ],
      },
      select: {
        sentAt: true,
        nextFollowup: true,
        status: true,
        step: true,
        replied: true,
      },
    });

    const days: Record<string, {
      sent: number;        // step=1 actually sent (status=sent/replied/bounced/failed)
      followup1: number;   // step=2 actually sent
      followup2: number;   // step=3 actually sent
      bulkQueued: number;  // user explicitly bulk-scheduled (sentAt is future, status=scheduled)
      autoFollowup: number; // auto-calculated follow-up (nextFollowup > today, system will send this)
      replied: number;
    }> = {};

    const getDay = (key: string) => {
      if (!days[key]) {
        days[key] = { sent: 0, followup1: 0, followup2: 0, bulkQueued: 0, autoFollowup: 0, replied: 0 };
      }
      return days[key];
    };

    for (const lead of leads) {
      const step = lead.step ?? 1;

      // ── Bucket by sentAt ──
      if (lead.sentAt) {
        const k = dayKey(lead.sentAt);
        const d = getDay(k);
        const isHistorical = k <= todayStr;

        if (isHistorical) {
          // Past: actually sent leads
          if (["sent", "replied", "bounced", "failed"].includes(lead.status)) {
            if (step <= 1) d.sent++;
            else if (step === 2) d.followup1++;
            else d.followup2++;
            if (lead.replied) d.replied++;
          }
          // Past scheduled = overdue/stuck, skip (don't show as "queued")
        } else {
          // Future: user explicitly bulk-queued this for a future date
          if (lead.status === "scheduled") {
            d.bulkQueued++;
          }
        }
      }

      // ── Bucket by nextFollowup (ONLY if in the future = auto follow-up) ──
      if (lead.nextFollowup) {
        const k = dayKey(lead.nextFollowup);
        if (k > todayStr) {
          // This is an auto-calculated follow-up the system will send later
          // Only count leads that are not already bulk-queued for this exact date
          // (i.e. their sentAt is NOT the same as nextFollowup)
          const sentAtKey = lead.sentAt ? dayKey(lead.sentAt) : null;
          if (sentAtKey !== k) {
            getDay(k).autoFollowup++;
          }
        }
      }
    }

    return NextResponse.json({ success: true, year, month, days });
  } catch (error) {
    console.error("Schedule calendar error:", error);
    return NextResponse.json({ success: false, error: "Failed to load calendar data" }, { status: 500 });
  }
}
