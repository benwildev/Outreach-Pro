import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = (url.searchParams.get("campaignId") ?? "").trim();
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "30"), 7), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      sentAt: { gte: since },
      ...(campaignId ? { campaignId } : {}),
    };

    const leads = await prisma.lead.findMany({
      where,
      select: {
        sentAt: true,
        replied: true,
        replyCategory: true,
        unsubscribed: true,
        status: true,
        sentGmailAuthUser: true,
        campaignId: true,
        campaign: { select: { name: true } },
      },
    });

    // Sends per day
    const sendsByDay: Record<string, number> = {};
    const repliesByDay: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const k = dayKey(d);
      sendsByDay[k] = 0;
      repliesByDay[k] = 0;
    }

    // Account performance
    const accountMap: Record<string, { sent: number; replied: number; positive: number; ooo: number; negative: number; unsubscribed: number }> = {};

    // Campaign performance
    const campaignMap: Record<string, { name: string; sent: number; replied: number; positive: number; ooo: number; negative: number; unsubscribed: number }> = {};

    for (const lead of leads) {
      const key = lead.sentAt ? dayKey(lead.sentAt) : null;
      if (key && sendsByDay[key] !== undefined) {
        sendsByDay[key]++;
        if (lead.replied) repliesByDay[key]++;
      }

      // Account stats
      const acct = lead.sentGmailAuthUser || "unknown";
      if (!accountMap[acct]) accountMap[acct] = { sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0 };
      accountMap[acct].sent++;
      if (lead.replied) {
        accountMap[acct].replied++;
        if (lead.replyCategory === "positive") accountMap[acct].positive++;
        else if (lead.replyCategory === "ooo") accountMap[acct].ooo++;
        else if (lead.replyCategory === "negative") accountMap[acct].negative++;
        else if (lead.replyCategory === "unsubscribe") accountMap[acct].unsubscribed++;
      }

      // Campaign stats
      const cid = lead.campaignId;
      if (!campaignMap[cid]) campaignMap[cid] = { name: lead.campaign?.name ?? cid, sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0 };
      campaignMap[cid].sent++;
      if (lead.replied) {
        campaignMap[cid].replied++;
        if (lead.replyCategory === "positive") campaignMap[cid].positive++;
        else if (lead.replyCategory === "ooo") campaignMap[cid].ooo++;
        else if (lead.replyCategory === "negative") campaignMap[cid].negative++;
        else if (lead.replyCategory === "unsubscribe") campaignMap[cid].unsubscribed++;
      }
    }

    const sendsPerDay = Object.entries(sendsByDay).map(([date, sent]) => ({
      date,
      sent,
      replied: repliesByDay[date] ?? 0,
      replyRate: sent > 0 ? Math.round((repliesByDay[date] / sent) * 100) : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const accountStats = Object.entries(accountMap).map(([account, s]) => ({
      account,
      ...s,
      replyRate: s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0,
    })).sort((a, b) => b.sent - a.sent);

    const campaignStats = Object.entries(campaignMap).map(([id, s]) => ({
      id,
      ...s,
      replyRate: s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0,
    })).sort((a, b) => b.sent - a.sent);

    // Overall totals
    const totalSent = leads.length;
    const totalReplied = leads.filter((l) => l.replied).length;
    const totalPositive = leads.filter((l) => l.replyCategory === "positive" && l.replied).length;
    const totalOoo = leads.filter((l) => l.replyCategory === "ooo").length;
    const totalNegative = leads.filter((l) => l.replyCategory === "negative").length;
    const totalUnsubscribed = leads.filter((l) => l.unsubscribed).length;

    return NextResponse.json({
      success: true,
      days,
      totals: {
        sent: totalSent,
        replied: totalReplied,
        positive: totalPositive,
        ooo: totalOoo,
        negative: totalNegative,
        unsubscribed: totalUnsubscribed,
        replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
      },
      sendsPerDay,
      accountStats,
      campaignStats,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ success: false, error: "Failed to load analytics" }, { status: 500 });
  }
}
