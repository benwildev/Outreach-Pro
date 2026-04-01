import Link from "next/link";
import { ArrowLeft, TrendingUp, Mail, Reply, UserX, Clock, ThumbsUp, Zap, Users, BarChart2 } from "lucide-react";
import Image from "next/image";
import DailyReportCard from "./DailyReportCard";
import ScheduleCalendar from "./ScheduleCalendar";
import VolumeTrendsChart from "./VolumeTrendsChart";
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

  const today   = data?.today   ?? { sent: 0, scheduled: 0 };
  const totals  = data?.totals  ?? { sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0, replyRate: 0 };
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

  const totalEmails = totals.sent;
  const replyTotal  = totals.positive + totals.ooo + totals.negative + totals.unsubscribed;

  return (
    <div className="min-h-screen bg-[#f0f2f9]">
      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-[#12175c] to-[#2a3299] shadow-lg">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Benwill Outreach" width={36} height={36} className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5" />
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Campaign Analytics</h1>
              <p className="text-[11px] text-indigo-300 font-medium">Last {days} days</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 bg-white/10 rounded-xl p-1 border border-white/10">
              {[7, 14, 30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/analytics?days=${d}${campaignId ? `&campaign=${campaignId}` : ""}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    days === d
                      ? "bg-white text-indigo-900 shadow-sm"
                      : "text-indigo-200 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 hover:text-white border border-white/20 hover:border-white/40 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-7 space-y-6">

        {/* ── Row 1a: Today hero cards ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-5 shadow-md flex items-center gap-4">
            <div className="bg-white/20 rounded-xl p-3"><Zap className="w-6 h-6 text-white" /></div>
            <div>
              <div className="text-3xl font-black text-white leading-none">{today.sent}</div>
              <div className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wider mt-1">Sent Today</div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 shadow-md flex items-center gap-4">
            <div className="bg-white/20 rounded-xl p-3"><Clock className="w-6 h-6 text-white" /></div>
            <div>
              <div className="text-3xl font-black text-white leading-none">{today.scheduled}</div>
              <div className="text-[11px] font-semibold text-orange-100 uppercase tracking-wider mt-1">Queued Today</div>
            </div>
          </div>
        </div>

        {/* ── Row 1b: Period stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Sent",    value: totals.sent,           icon: Mail,       color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-100" },
            { label: "Replied",       value: totals.replied,        icon: Reply,      color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
            { label: "Reply Rate",    value: `${totals.replyRate}%`, icon: TrendingUp, color: "text-blue-600",   bg: "bg-blue-50",    border: "border-blue-100" },
            { label: "Positive",      value: totals.positive,       icon: ThumbsUp,   color: "text-green-600",  bg: "bg-green-50",   border: "border-green-100" },
            { label: "Out of Office", value: totals.ooo,            icon: Clock,      color: "text-amber-600",  bg: "bg-amber-50",   border: "border-amber-100" },
            { label: "Unsubscribed",  value: totals.unsubscribed,   icon: UserX,      color: "text-red-600",    bg: "bg-red-50",     border: "border-red-100" },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`bg-white rounded-2xl shadow-sm border ${border} p-4 flex flex-col gap-3`}>
              <div className={`${bg} ${color} rounded-lg p-1.5 w-fit`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-black text-gray-900 leading-none">{value}</div>
              <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider leading-tight">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Volume Trends Chart ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                Volume Trends
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Daily breakdown across all send types</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-indigo-700">{totalEmails.toLocaleString()}</div>
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Total in period</div>
            </div>
          </div>
          <VolumeTrendsChart data={sendsPerDay} />
        </div>

        {/* ── Row 3: Account Performance + Reply Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Account Performance — 3/5 */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                Account Performance
              </h2>
              <span className="text-[11px] text-gray-400 font-medium">{accountStats.length} accounts</span>
            </div>
            {accountStats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No data for this period.</p>
            ) : (
              <div className="space-y-3">
                {accountStats.map((a) => {
                  const total = a.sent + a.totalScheduled;
                  const sentPct = total > 0 ? (a.sent / total) * 100 : 0;
                  const schPct  = total > 0 ? (a.totalScheduled / total) * 100 : 0;
                  return (
                    <div key={a.account} className="group p-3 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-800 truncate max-w-[55%]">{a.account}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {a.todaySent > 0 && (
                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">
                              {a.todaySent} today
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                            {a.replyRate}% reply
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex gap-px">
                        <div className="h-full bg-indigo-500 rounded-l-full transition-all" style={{ width: `${sentPct}%` }} />
                        <div className="h-full bg-amber-400 rounded-r-full transition-all" style={{ width: `${schPct}%` }} />
                      </div>

                      {/* Counters row */}
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex gap-3 text-[10px] text-gray-500">
                          <span><span className="font-bold text-indigo-600">{a.sent}</span> sent</span>
                          {a.totalScheduled > 0 && <span><span className="font-bold text-amber-600">{a.totalScheduled}</span> queued</span>}
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          {a.positive > 0 && <span className="text-emerald-600 font-semibold">+{a.positive}</span>}
                          {a.ooo > 0 && <span className="text-amber-500 font-semibold">{a.ooo} OOO</span>}
                          {a.unsubscribed > 0 && <span className="text-red-500 font-semibold">{a.unsubscribed} unsub</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reply Breakdown — 2/5 */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Reply className="w-4 h-4 text-emerald-500" />
                Reply Breakdown
              </h2>
              <span className="text-[11px] text-gray-400 font-medium">{totals.replied} total</span>
            </div>

            {totals.replied === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-10 gap-2">
                <Reply className="w-8 h-8 opacity-30" />
                <p className="text-sm">No replies yet</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-5">
                {/* Stacked bar */}
                <div className="flex h-10 rounded-xl overflow-hidden gap-0.5">
                  {[
                    { key: "positive",   val: totals.positive,     color: "bg-emerald-500", label: "Positive" },
                    { key: "ooo",        val: totals.ooo,           color: "bg-amber-400",   label: "OOO" },
                    { key: "negative",   val: totals.negative,      color: "bg-rose-400",    label: "Negative" },
                    { key: "unsub",      val: totals.unsubscribed,  color: "bg-red-600",     label: "Unsub" },
                  ]
                    .filter((c) => c.val > 0)
                    .map((c) => (
                      <div
                        key={c.key}
                        className={`${c.color} flex items-center justify-center text-white text-[10px] font-bold transition-all`}
                        style={{ flex: c.val }}
                        title={`${c.label}: ${c.val}`}
                      >
                        {c.val}
                      </div>
                    ))}
                </div>

                {/* Category rows */}
                <div className="space-y-2.5">
                  {[
                    { label: "Positive",    val: totals.positive,    color: "bg-emerald-500", text: "text-emerald-700", lightBg: "bg-emerald-50" },
                    { label: "Out of Office", val: totals.ooo,       color: "bg-amber-400",   text: "text-amber-700",  lightBg: "bg-amber-50" },
                    { label: "Negative",    val: totals.negative,    color: "bg-rose-400",    text: "text-rose-700",   lightBg: "bg-rose-50" },
                    { label: "Unsubscribed",val: totals.unsubscribed, color: "bg-red-600",    text: "text-red-700",    lightBg: "bg-red-50" },
                  ].map(({ label, val, color, text, lightBg }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-sm ${color} shrink-0`} />
                      <span className="flex-1 text-xs text-gray-600">{label}</span>
                      <span className={`text-xs font-black ${text} ${lightBg} px-2 py-0.5 rounded-lg`}>{val}</span>
                      <span className="text-[10px] text-gray-400 w-10 text-right">
                        {replyTotal > 0 ? `${Math.round((val / replyTotal) * 100)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Rate */}
                <div className="mt-auto pt-4 border-t border-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Overall reply rate</span>
                    <span className="text-sm font-black text-indigo-700">{totals.replyRate}%</span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${totals.replyRate}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: Schedule Calendar ── */}
        <ScheduleCalendar />

        {/* ── Row 5: Campaign Performance ── */}
        {campaignStats.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                Campaign Performance
              </h2>
              <span className="text-[11px] text-gray-400 font-medium">{campaignStats.length} campaigns</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaignStats.map((c) => {
                const maxSent = campaignStats[0]?.sent ?? 1;
                const barPct = maxSent > 0 ? Math.round((c.sent / maxSent) * 100) : 0;
                return (
                  <div key={c.id} className="group p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-xs group-hover:text-indigo-600 transition-colors leading-snug flex-1">{c.name}</h3>
                      {c.todayScheduled > 0 && (
                        <span className="shrink-0 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                          Due: {c.todayScheduled}
                        </span>
                      )}
                    </div>

                    {/* Bar */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-400 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex gap-3 text-gray-500">
                        <span><span className="font-bold text-gray-700">{c.sent}</span> sent</span>
                        <span><span className="font-bold text-emerald-600">{c.replyRate}%</span> reply</span>
                      </div>
                      <div className="flex gap-1.5">
                        {c.positive > 0 && <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">+{c.positive}</span>}
                        {c.ooo > 0 && <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">{c.ooo} OOO</span>}
                        {c.unsubscribed > 0 && <span className="px-1 py-0.5 rounded bg-red-50 text-red-700 font-bold">{c.unsubscribed} ✗</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Row 6: Daily Report ── */}
        <DailyReportCard />

      </main>
    </div>
  );
}
