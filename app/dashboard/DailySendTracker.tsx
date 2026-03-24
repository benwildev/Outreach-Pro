import { Send, AlertTriangle, TrendingUp } from "lucide-react";

const GMAIL_DAILY_LIMIT = 500;
const WARN_THRESHOLD = 0.7;

interface AccountStat {
  account: string;
  count: number;
}

interface DailySendTrackerProps {
  accountStats: AccountStat[];
}

export function DailySendTracker({ accountStats }: DailySendTrackerProps) {
  if (accountStats.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-indigo-100 rounded-lg p-1.5">
            <Send className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-gray-700">Today&apos;s Sends</span>
          <span className="text-xs text-gray-400 font-normal">per Gmail account</span>
          <TrendingUp className="w-3.5 h-3.5 text-gray-300 ml-auto" />
        </div>
        <div className="flex flex-wrap gap-5">
          {accountStats.map(({ account, count }) => {
            const pct = Math.min(100, Math.round((count / GMAIL_DAILY_LIMIT) * 100));
            const isWarning = count / GMAIL_DAILY_LIMIT >= WARN_THRESHOLD;
            const isDanger = count >= GMAIL_DAILY_LIMIT;
            const barColor = isDanger
              ? "bg-red-500"
              : isWarning
              ? "bg-amber-400"
              : "bg-indigo-500";
            const pillColor = isDanger
              ? "bg-red-50 text-red-700 border-red-200"
              : isWarning
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-indigo-50 text-indigo-700 border-indigo-200";

            return (
              <div key={account} className="flex-1 min-w-[180px] max-w-[260px]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-600 truncate" title={account}>
                    {account}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap ${pillColor}`}>
                    {isDanger && <AlertTriangle className="w-2.5 h-2.5" />}
                    {count} / {GMAIL_DAILY_LIMIT}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{pct}% of daily limit</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
