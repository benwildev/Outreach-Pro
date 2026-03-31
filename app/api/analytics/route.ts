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

    const now = new Date();
    const todayStr = dayKey(now);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch leads that were either sent recently OR are currently scheduled for the future
    const where = {
      OR: [
        { sentAt: { gte: since } },
        { status: "scheduled" },
        { status: "pending" }
      ],
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
        nextFollowup: true,
        campaignId: true,
        campaign: { select: { name: true, gmailAuthUser: true } },
      },
    });

    // Stats maps
    const sendsByDay: Record<string, number> = {};
    const repliesByDay: Record<string, number> = {};
    const scheduledByDay: Record<string, number> = {};

    // Initialize historical days
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const k = dayKey(d);
      sendsByDay[k] = 0;
      repliesByDay[k] = 0;
      scheduledByDay[k] = 0;
    }

    // Initialize future days for queue outlook (next 7 days)
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const k = dayKey(d);
      scheduledByDay[k] = 0;
    }

    // Today specific stats
    let todaySentCount = 0;
    let todayScheduledCount = 0;

    // Performance maps
    const accountMap: Record<string, { 
      sent: number; 
      replied: number; 
      positive: number; 
      ooo: number; 
      negative: number; 
      unsubscribed: number;
      todaySent: number;
      todayScheduled: number;
      totalScheduled: number;
    }> = {};

    const campaignMap: Record<string, { 
      name: string; 
      sent: number; 
      replied: number; 
      positive: number; 
      ooo: number; 
      negative: number; 
      unsubscribed: number;
      todaySent: number;
      todayScheduled: number;
    }> = {};

    for (const lead of leads) {
      // 1. Historical Trends (Sent)
      const sentDateKey = lead.sentAt ? dayKey(lead.sentAt) : null;
      if (sentDateKey && sendsByDay[sentDateKey] !== undefined) {
        sendsByDay[sentDateKey]++;
        if (lead.replied) repliesByDay[sentDateKey]++;
        
        if (sentDateKey === todayStr) {
          todaySentCount++;
        }
      }

      // 2. Future Trends (Scheduled)
      const scheduledDateKey = lead.nextFollowup ? dayKey(lead.nextFollowup) : (lead.status === 'pending' ? todayStr : null);
      if (scheduledDateKey && scheduledByDay[scheduledDateKey] !== undefined) {
        scheduledByDay[scheduledDateKey]++;
        
        if (scheduledDateKey === todayStr || (lead.nextFollowup && lead.nextFollowup < now && lead.status === 'scheduled')) {
          todayScheduledCount++;
        }
      }

      // 3. Account & Campaign Grouping
      const rawAcct = lead.sentGmailAuthUser || lead.campaign?.gmailAuthUser?.split(',')[0]?.trim() || "unknown";
      const isEmailAccount = rawAcct.includes("@");
      const acct = isEmailAccount ? rawAcct : "Unassigned Queue";
      const cid = lead.campaignId;

      if (isEmailAccount) {
        if (!accountMap[acct]) accountMap[acct] = { 
          sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0, 
          todaySent: 0, todayScheduled: 0, totalScheduled: 0 
        };
      }

      if (!campaignMap[cid]) campaignMap[cid] = { 
        name: lead.campaign?.name ?? cid, 
        sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0,
        todaySent: 0, todayScheduled: 0
      };

      // Tally Sent stats
      if (lead.sentAt && sentDateKey && sentDateKey >= dayKey(since)) {
        if (isEmailAccount) accountMap[acct].sent++;
        campaignMap[cid].sent++;
        
        if (sentDateKey === todayStr) {
          if (isEmailAccount) accountMap[acct].todaySent++;
          campaignMap[cid].todaySent++;
        }

        if (lead.replied) {
          if (isEmailAccount) accountMap[acct].replied++;
          campaignMap[cid].replied++;
          
          const cat = lead.replyCategory;
          if (cat === "positive") { if (isEmailAccount) accountMap[acct].positive++; campaignMap[cid].positive++; }
          else if (cat === "ooo") { if (isEmailAccount) accountMap[acct].ooo++; campaignMap[cid].ooo++; }
          else if (cat === "negative") { if (isEmailAccount) accountMap[acct].negative++; campaignMap[cid].negative++; }
          else if (cat === "unsubscribe") { if (isEmailAccount) accountMap[acct].unsubscribed++; campaignMap[cid].unsubscribed++; }
        }
      }

      // Tally Scheduled stats
      if (lead.status === 'scheduled' || lead.status === 'pending') {
        if (isEmailAccount) accountMap[acct].totalScheduled++;
        if (scheduledDateKey === todayStr || (lead.nextFollowup && lead.nextFollowup < now)) {
          if (isEmailAccount) accountMap[acct].todayScheduled++;
          campaignMap[cid].todayScheduled++;
        }
      }
    }

    // Format output
    const sendsPerDay = Object.entries(sendsByDay).map(([date, sent]) => ({
      date,
      sent,
      replied: repliesByDay[date] ?? 0,
      scheduled: scheduledByDay[date] ?? 0,
      replyRate: sent > 0 ? Math.round((repliesByDay[date] / sent) * 100) : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Also provide a dedicated "by date" summary that combines history and future
    const dailyVolume = Array.from(new Set([...Object.keys(sendsByDay), ...Object.keys(scheduledByDay)]))
      .map(date => ({
        date,
        sent: sendsByDay[date] ?? 0,
        scheduled: scheduledByDay[date] ?? 0,
        replied: repliesByDay[date] ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

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

    return NextResponse.json({
      success: true,
      days,
      today: {
        sent: todaySentCount,
        scheduled: todayScheduledCount,
      },
      totals: {
        sent: leads.filter(l => l.sentAt).length,
        replied: leads.filter(l => l.replied).length,
        positive: leads.filter(l => l.replyCategory === "positive" && l.replied).length,
        ooo: leads.filter(l => l.replyCategory === "ooo").length,
        negative: leads.filter(l => l.replyCategory === "negative").length,
        unsubscribed: leads.filter(l => l.unsubscribed).length,
        replyRate: leads.filter(l => l.sentAt).length > 0 
          ? Math.round((leads.filter(l => l.replied).length / leads.filter(l => l.sentAt).length) * 100) 
          : 0,
      },
      sendsPerDay,
      dailyVolume,
      accountStats,
      campaignStats,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ success: false, error: "Failed to load analytics" }, { status: 500 });
  }
}

