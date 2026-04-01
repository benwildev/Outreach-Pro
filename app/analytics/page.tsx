import Link from "next/link";
import { BarChart2, ArrowLeft, TrendingUp, Mail, Reply, UserX, Clock, ThumbsUp, Calendar, Zap } from "lucide-react";
import Image from "next/image";
import DailyReportCard from "./DailyReportCard";
import { getAnalytics } from "@/lib/getAnalytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string; campaign?: string };
}) {
  const days = Math.min(Math.max(Number(searchParams.days ?? "30"), 7), 90);
  const campaignId = searchParams.campaign ?? "";

  let data: Awaited<ReturnType<typeof getAnalytics>> | null = null;
  try {
    data = await getAnalytics(days, campaignId);
  } catch {
    data = null;
  }

  const today = data?.today ?? { sent: 0, scheduled: 0 };
  const totals = data?.totals ?? { sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0, replyRate: 0 };
  const dailyVolume: Array<{ date: string; sent: number; scheduled: number; followup1: number; followup2: number; replied: number }> = data?.dailyVolume ?? [];
  const accountStats: Array<{
    account: string; sent: number; replied: number; replyRate: number;
    todaySent: number; todayScheduled: number; totalScheduled: number;
    positive: number; ooo: number; negative: number; unsubscribed: number;
  }> = data?.accountStats ?? [];
  const campaignStats: Array<{
    id: string; name: string; sent: number; replied: number; replyRate: number;
    todaySent: number; todayScheduled: number;
    positive: number; ooo: number; negative: number; unsubscribed: number;
  }> = data?.campaignStats ?? [];

  const sendsPerDay = data?.sendsPerDay ?? [];
  const maxDailySends = Math.max(...sendsPerDay.map((d: { sent: number; scheduled: number }) => d.sent + d.scheduled), 1);

  const todayCards = [
    { label: "Sent Today", value: today.sent, icon: Zap, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
    { label: "Scheduled Today", value: today.scheduled, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  ];

  const statCards = [
    { label: "Emails Sent", value: totals.sent, icon: Mail, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Replied", value: totals.replied, icon: Reply, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Reply Rate", value: `${totals.replyRate}%`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Positive", value: totals.positive, icon: ThumbsUp, color: "text-green-600", bg: "bg-green-50" },
    { label: "Out of Office", value: totals.ooo, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Unsubscribed", value: totals.unsubscribed, icon: UserX, color: "text-red-600", bg: "bg-red-50" },
  ];

  const CATEGORY_COLORS: Record<string, string> = {
    positive: "bg-emerald-500",
    ooo: "bg-amber-400",
    negative: "bg-rose-400",
    unsubscribe: "bg-red-600",
  };

  const todayISO = new Date().toISOString().slice(0, 10);

  const activeDailyVolume = dailyVolume.filter((d) => d.sent > 0 || d.scheduled > 0 || d.followup1 > 0 || d.followup2 > 0 || d.replied > 0);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1a1f5e] to-[#2d3491] border-b border-indigo-900/30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Benwill Outreach" width={36} height={36} className="w-9 h-9 rounded-full object-contain bg-white/10 p-0.5" />
            <div>
              <h1 className="text-base font-bold text-white">Campaign Analytics</h1>
              <p className="text-xs text-indigo-300">Last {days} days</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-indigo-900/40 rounded-lg p-1 border border-indigo-700/40">
              {[7, 14, 30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/analytics?days=${d}${campaignId ? `&campaign=${campaignId}` : ""}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${days === d ? "bg-white text-indigo-900" : "text-indigo-200 hover:text-white"}`}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Today's Activity Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {todayCards.map((card) => (
            <div key={card.label} className={`bg-white rounded-2xl shadow-sm border-2 ${card.border} p-5 flex items-center gap-5`}>
              <div className={`${card.bg} ${card.color} rounded-xl p-3`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-gray-900">{card.value}</div>
                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Daily Report Card */}
        <DailyReportCard />

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
              <div className={`${bg} ${color} rounded-lg p-2 w-fit`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Sends per day chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Volume Trends</h2>
          {sendsPerDay.filter((d: { sent: number; scheduled: number }) => d.sent + d.scheduled > 0).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-0" style={{ minWidth: `${sendsPerDay.length * 28}px` }}>
                {sendsPerDay.map((d: { date: string; sent: number; scheduled: number; replied: number }) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                      {d.date}<br />{d.sent} sent · {d.scheduled} scheduled
                    </div>
                    <div className="w-full flex flex-col-reverse gap-px h-16 justify-end">
                      <div className="w-full bg-indigo-200 rounded-t-sm" style={{ height: `${maxDailySends > 0 ? Math.max(1, Math.round((d.sent / maxDailySends) * 100)) : 0}%` }} />
                      {d.scheduled > 0 && (
                        <div className="w-full bg-amber-200 rounded-sm" style={{ height: `${maxDailySends > 0 ? Math.max(1, Math.round((d.scheduled / maxDailySends) * 100)) : 0}%` }} />
                      )}
                      {d.replied > 0 && (
                        <div className="w-full bg-emerald-400 rounded-sm" style={{ height: `${maxDailySends > 0 ? Math.max(1, Math.round((d.replied / maxDailySends) * 100)) : 0}%` }} />
                      )}
                    </div>
                    <span className="text-[8px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-6 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Sent</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Scheduled</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Replied</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account performance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Account Performance</h2>
            {accountStats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data.</p>
            ) : (
              <div className="space-y-4 flex-1">
                {accountStats.map((a) => (
                  <div key={a.account} className="space-y-2 border-b border-gray-50 pb-3 last:border-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 truncate max-w-[50%]">{a.account}</span>
                      <div className="flex gap-3 text-gray-500 shrink-0">
                        <span title="Total scheduled"><Clock className="w-3 h-3 inline mr-0.5" />{a.totalScheduled}</span>
                        <span title="Total sent"><Mail className="w-3 h-3 inline mr-0.5" />{a.sent}</span>
                        <span className="font-medium text-emerald-600">{a.replyRate}% reply</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-indigo-500" style={{ width: `${a.sent > 0 ? (a.sent / (a.sent + a.totalScheduled)) * 100 : 0}%` }} />
                        <div className="h-full bg-amber-400" style={{ width: `${a.totalScheduled > 0 ? (a.totalScheduled / (a.sent + a.totalScheduled)) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex gap-2">
                        {a.todaySent > 0 && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold">Today: {a.todaySent} sent</span>}
                        {a.todayScheduled > 0 && <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold">Today: {a.todayScheduled} due</span>}
                      </div>
                      <div className="flex gap-2 text-gray-400">
                        {a.positive > 0 && <span className="text-emerald-600">+{a.positive} pos</span>}
                        {a.ooo > 0 && <span className="text-amber-500">{a.ooo} OOO</span>}
                        {a.unsubscribed > 0 && <span className="text-red-500">{a.unsubscribed} unsub</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily Volume Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Daily Volume Summary
            </h2>
            {activeDailyVolume.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data for this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-3 py-3 border-b border-gray-100">Date</th>
                      <th className="px-3 py-3 border-b border-gray-100 text-center">Sent</th>
                      <th className="px-3 py-3 border-b border-gray-100 text-center">Scheduled</th>
                      <th className="px-3 py-3 border-b border-gray-100 text-center">FU 1</th>
                      <th className="px-3 py-3 border-b border-gray-100 text-center">FU 2</th>
                      <th className="px-3 py-3 border-b border-gray-100 text-center">Replied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {activeDailyVolume.slice().reverse().map((d) => (
                      <tr key={d.date} className={`hover:bg-gray-50 transition-colors ${d.date === todayISO ? "bg-indigo-50/60" : ""}`}>
                        <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">
                          {d.date === todayISO ? <span className="text-indigo-600 font-bold">Today</span> : d.date}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.sent > 0 ? <span className="font-bold text-indigo-600">{d.sent}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.scheduled > 0 ? <span className="font-bold text-amber-600">{d.scheduled}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.followup1 > 0 ? <span className="font-bold text-emerald-600">{d.followup1}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.followup2 > 0 ? <span className="font-bold text-violet-600">{d.followup2}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.replied > 0 ? <span className="font-bold text-teal-600">{d.replied}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Campaign performance */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Campaign Performance</h2>
          {campaignStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaignStats.map((c) => (
                <div key={c.id} className="p-4 rounded-xl border border-gray-100 hover:border-indigo-100 transition-colors group">
                  <div className="flex flex-col gap-1 mb-3">
                    <h3 className="font-bold text-gray-800 text-sm group-hover:text-indigo-600 transition-colors truncate">{c.name}</h3>
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>{c.sent} sent · {c.replyRate}% reply</span>
                      {c.todayScheduled > 0 && <span className="text-amber-600 font-bold">Due today: {c.todayScheduled}</span>}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${campaignStats[0]?.sent > 0 ? Math.round((c.sent / campaignStats[0].sent) * 100) : 0}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.positive > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold">+{c.positive} Pos</span>}
                    {c.ooo > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold">{c.ooo} OOO</span>}
                    {c.unsubscribed > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-bold">{c.unsubscribed} Unsub</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply category breakdown */}
        {totals.replied > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Reply Breakdown</h2>
            <div className="flex gap-2 h-8 rounded-lg overflow-hidden">
              {Object.entries({
                positive: totals.positive,
                ooo: totals.ooo,
                negative: totals.negative,
                unsubscribe: totals.unsubscribed,
              })
                .filter(([, v]) => v > 0)
                .map(([cat, count]) => (
                  <div
                    key={cat}
                    className={`${CATEGORY_COLORS[cat] ?? "bg-gray-300"} flex items-center justify-center text-white text-[10px] font-bold rounded-sm`}
                    style={{ flex: count }}
                    title={`${cat}: ${count}`}
                  >
                    {count}
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Positive ({totals.positive})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> OOO ({totals.ooo})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Negative ({totals.negative})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-600 inline-block" /> Unsubscribed ({totals.unsubscribed})</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
