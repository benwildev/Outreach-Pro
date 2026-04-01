import { prisma } from "@/lib/prisma";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getAnalytics(days: number, campaignId: string) {
  const now = new Date();
  const todayStr = dayKey(now);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = dayKey(since);

  const where = {
    OR: [
      { sentAt: { gte: since } },
      { status: "scheduled" },
      { status: "pending" },
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
      step: true,
      sentGmailAuthUser: true,
      nextFollowup: true,
      campaignId: true,
      campaign: { select: { name: true, gmailAuthUser: true } },
    },
  });

  // ── Initialize buckets ONLY for historical days (since → today, no future) ──
  const sentStep1ByDay: Record<string, number> = {};   // step 1 sent
  const scheduledByDay: Record<string, number> = {};   // status=scheduled (queued, sentAt on that date)
  const followup1ByDay: Record<string, number> = {};   // step 2 sent
  const followup2ByDay: Record<string, number> = {};   // step 3 sent
  const repliesByDay: Record<string, number> = {};
  const allSentByDay: Record<string, number> = {};     // for chart (all sent regardless of step)

  for (let i = 0; i <= days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const k = dayKey(d);
    if (k > todayStr) break; // stop at today — no future buckets
    sentStep1ByDay[k] = 0;
    scheduledByDay[k] = 0;
    followup1ByDay[k] = 0;
    followup2ByDay[k] = 0;
    repliesByDay[k] = 0;
    allSentByDay[k] = 0;
  }

  let todaySentCount = 0;
  let todayScheduledCount = 0;

  const accountMap: Record<string, {
    sent: number; replied: number; positive: number; ooo: number;
    negative: number; unsubscribed: number; todaySent: number;
    todayScheduled: number; totalScheduled: number;
  }> = {};

  const campaignMap: Record<string, {
    name: string; sent: number; replied: number; positive: number;
    ooo: number; negative: number; unsubscribed: number;
    todaySent: number; todayScheduled: number;
  }> = {};

  for (const lead of leads) {
    const sentDateKey = lead.sentAt ? dayKey(lead.sentAt) : null;
    const step = lead.step ?? 1;

    // ── Daily bucket tallies (historical dates only) ──
    if (sentDateKey && sentDateKey <= todayStr) {
      if (lead.status === "scheduled") {
        // Bulk-scheduled lead: queued but not sent yet — only count if date is in window
        if (scheduledByDay[sentDateKey] !== undefined) {
          scheduledByDay[sentDateKey]++;
        }
        if (sentDateKey === todayStr) todayScheduledCount++;
      } else if (["sent", "replied", "bounced", "failed"].includes(lead.status)) {
        // Sent leads — split by step
        if (allSentByDay[sentDateKey] !== undefined) allSentByDay[sentDateKey]++;
        if (lead.replied && repliesByDay[sentDateKey] !== undefined) repliesByDay[sentDateKey]++;
        if (sentDateKey === todayStr) todaySentCount++;

        if (step <= 1) {
          if (sentStep1ByDay[sentDateKey] !== undefined) sentStep1ByDay[sentDateKey]++;
        } else if (step === 2) {
          if (followup1ByDay[sentDateKey] !== undefined) followup1ByDay[sentDateKey]++;
        } else {
          if (followup2ByDay[sentDateKey] !== undefined) followup2ByDay[sentDateKey]++;
        }
      }
    } else if (!sentDateKey) {
      // Pending / scheduled with no sentAt yet → count toward today's scheduled
      if (lead.status === "scheduled" || lead.status === "pending") {
        const scheduledKey = lead.nextFollowup && dayKey(lead.nextFollowup) <= todayStr
          ? dayKey(lead.nextFollowup)
          : null;
        if (scheduledKey && scheduledByDay[scheduledKey] !== undefined) {
          scheduledByDay[scheduledKey]++;
        }
        if (
          lead.status === "scheduled" &&
          lead.nextFollowup &&
          lead.nextFollowup <= now
        ) {
          todayScheduledCount++;
        }
        if (lead.status === "pending") todayScheduledCount++;
      }
    }

    // ── Account & Campaign grouping ──
    const rawAcct =
      lead.sentGmailAuthUser ||
      lead.campaign?.gmailAuthUser?.split(",")[0]?.trim() ||
      "unknown";
    const isEmailAccount = rawAcct.includes("@");
    const acct = isEmailAccount ? rawAcct : "Unassigned Queue";
    const cid = lead.campaignId;

    if (isEmailAccount) {
      if (!accountMap[acct])
        accountMap[acct] = {
          sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0,
          unsubscribed: 0, todaySent: 0, todayScheduled: 0, totalScheduled: 0,
        };
    }

    if (!campaignMap[cid])
      campaignMap[cid] = {
        name: lead.campaign?.name ?? cid,
        sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0,
        unsubscribed: 0, todaySent: 0, todayScheduled: 0,
      };

    // Tally sent stats within window
    if (lead.sentAt && sentDateKey && sentDateKey >= sinceStr && sentDateKey <= todayStr &&
        ["sent", "replied", "bounced", "failed"].includes(lead.status)) {
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
        if (cat === "positive")   { if (isEmailAccount) accountMap[acct].positive++;   campaignMap[cid].positive++;   }
        else if (cat === "ooo")   { if (isEmailAccount) accountMap[acct].ooo++;         campaignMap[cid].ooo++;         }
        else if (cat === "negative") { if (isEmailAccount) accountMap[acct].negative++; campaignMap[cid].negative++; }
        else if (cat === "unsubscribe") { if (isEmailAccount) accountMap[acct].unsubscribed++; campaignMap[cid].unsubscribed++; }
      }
    }

    if (lead.status === "scheduled" || lead.status === "pending") {
      if (isEmailAccount) accountMap[acct].totalScheduled++;
      const isDueToday =
        (lead.status === "pending") ||
        (lead.nextFollowup && lead.nextFollowup <= now);
      if (isDueToday) {
        if (isEmailAccount) accountMap[acct].todayScheduled++;
        campaignMap[cid].todayScheduled++;
      }
    }
  }

  // ── Chart data (all historical dates) ──
  const sendsPerDay = Object.keys(allSentByDay)
    .map((date) => ({
      date,
      sent: allSentByDay[date],
      scheduled: scheduledByDay[date] ?? 0,
      replied: repliesByDay[date] ?? 0,
      replyRate: allSentByDay[date] > 0
        ? Math.round(((repliesByDay[date] ?? 0) / allSentByDay[date]) * 100)
        : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Daily Volume table — historical dates only, with step breakdown ──
  const allHistoricalDates = Array.from(
    new Set([
      ...Object.keys(sentStep1ByDay),
      ...Object.keys(scheduledByDay),
      ...Object.keys(followup1ByDay),
      ...Object.keys(followup2ByDay),
    ])
  ).filter((d) => d >= sinceStr && d <= todayStr);

  const dailyVolume = allHistoricalDates
    .map((date) => ({
      date,
      sent: sentStep1ByDay[date] ?? 0,
      scheduled: scheduledByDay[date] ?? 0,
      followup1: followup1ByDay[date] ?? 0,
      followup2: followup2ByDay[date] ?? 0,
      replied: repliesByDay[date] ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const accountStats = Object.entries(accountMap)
    .map(([account, s]) => ({
      account, ...s,
      replyRate: s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0,
    }))
    .sort((a, b) => b.sent - a.sent);

  const campaignStats = Object.entries(campaignMap)
    .map(([id, s]) => ({
      id, ...s,
      replyRate: s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0,
    }))
    .sort((a, b) => b.sent - a.sent);

  const sentLeads = leads.filter((l) => l.sentAt && ["sent", "replied", "bounced", "failed"].includes(l.status));

  return {
    success: true,
    days,
    today: { sent: todaySentCount, scheduled: todayScheduledCount },
    totals: {
      sent: sentLeads.length,
      replied: leads.filter((l) => l.replied).length,
      positive: leads.filter((l) => l.replyCategory === "positive" && l.replied).length,
      ooo: leads.filter((l) => l.replyCategory === "ooo").length,
      negative: leads.filter((l) => l.replyCategory === "negative").length,
      unsubscribed: leads.filter((l) => l.unsubscribed).length,
      replyRate:
        sentLeads.length > 0
          ? Math.round((leads.filter((l) => l.replied).length / sentLeads.length) * 100)
          : 0,
    },
    sendsPerDay,
    dailyVolume,
    accountStats,
    campaignStats,
  };
}
