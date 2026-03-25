import Link from "next/link";
import { BarChart2, ArrowLeft, TrendingUp, Mail, Reply, UserX, Clock, ThumbsUp } from "lucide-react";

export const dynamic = "force-dynamic";

async function getAnalytics(days: number, campaignId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5000";
  const params = new URLSearchParams({ days: String(days) });
  if (campaignId) params.set("campaignId", campaignId);
  const res = await fetch(`${base}/api/analytics?${params}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-end h-12 w-full">
      <div className={`w-full rounded-t-sm ${color} transition-all`} style={{ height: `${pct}%` }} />
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string; campaign?: string };
}) {
  const days = Math.min(Math.max(Number(searchParams.days ?? "30"), 7), 90);
  const campaignId = searchParams.campaign ?? "";
  const data = await getAnalytics(days, campaignId);

  const totals = data?.totals ?? { sent: 0, replied: 0, positive: 0, ooo: 0, negative: 0, unsubscribed: 0, replyRate: 0 };
  const sendsPerDay: Array<{ date: string; sent: number; replied: number; replyRate: number }> = data?.sendsPerDay ?? [];
  const accountStats: Array<{ account: string; sent: number; replied: number; replyRate: number; positive: number; ooo: number; negative: number; unsubscribed: number }> = data?.accountStats ?? [];
  const campaignStats: Array<{ id: string; name: string; sent: number; replied: number; replyRate: number; positive: number; ooo: number; negative: number; unsubscribed: number }> = data?.campaignStats ?? [];

  const maxDailySends = Math.max(...sendsPerDay.map((d) => d.sent), 1);

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

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1a1f5e] to-[#2d3491] border-b border-indigo-900/30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Benwill Outreach" className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5" />
            <div>
              <h1 className="text-base font-bold text-white">Campaign Analytics</h1>
              <p className="text-xs text-indigo-300">Last {days} days</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Day range picker */}
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
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Sends Per Day</h2>
          {sendsPerDay.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-0" style={{ minWidth: `${sendsPerDay.length * 28}px` }}>
                {sendsPerDay.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {d.date}: {d.sent} sent, {d.replied} replied
                    </div>
                    <div className="w-full flex flex-col-reverse gap-px h-16 justify-end">
                      <div className="w-full bg-indigo-200 rounded-t-sm" style={{ height: `${maxDailySends > 0 ? Math.max(2, Math.round((d.sent / maxDailySends) * 100)) : 0}%` }} />
                      {d.replied > 0 && (
                        <div className="w-full bg-emerald-400 rounded-sm" style={{ height: `${maxDailySends > 0 ? Math.max(2, Math.round((d.replied / maxDailySends) * 100)) : 0}%` }} />
                      )}
                    </div>
                    <span className="text-[8px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Sent</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Replied</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account performance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Account Performance</h2>
            {accountStats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data.</p>
            ) : (
              <div className="space-y-3">
                {accountStats.map((a) => (
                  <div key={a.account} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 truncate max-w-[60%]">{a.account}</span>
                      <span className="text-gray-500 shrink-0">{a.sent} sent · {a.replyRate}% reply</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${accountStats[0]?.sent > 0 ? Math.round((a.sent / accountStats[0].sent) * 100) : 0}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      {a.positive > 0 && <span className="text-emerald-600">+{a.positive} positive</span>}
                      {a.ooo > 0 && <span className="text-amber-500">{a.ooo} OOO</span>}
                      {a.negative > 0 && <span className="text-rose-500">{a.negative} negative</span>}
                      {a.unsubscribed > 0 && <span className="text-red-600">{a.unsubscribed} unsub</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campaign performance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Campaign Performance</h2>
            {campaignStats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data.</p>
            ) : (
              <div className="space-y-3">
                {campaignStats.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 truncate max-w-[60%]">{c.name}</span>
                      <span className="text-gray-500 shrink-0">{c.sent} sent · {c.replyRate}% reply</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${campaignStats[0]?.sent > 0 ? Math.round((c.sent / campaignStats[0].sent) * 100) : 0}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      {c.positive > 0 && <span className="text-emerald-600">+{c.positive} positive</span>}
                      {c.ooo > 0 && <span className="text-amber-500">{c.ooo} OOO</span>}
                      {c.negative > 0 && <span className="text-rose-500">{c.negative} negative</span>}
                      {c.unsubscribed > 0 && <span className="text-red-600">{c.unsubscribed} unsub</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
