import { Mail, AlertTriangle } from "lucide-react";

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
    <div className="mb-6 animate-slideUp">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-gray-700">Today&apos;s Sends per Gmail Account</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {accountStats.map(({ account, count }) => {
            const pct = Math.min(100, Math.round((count / GMAIL_DAILY_LIMIT) * 100));
            const isWarning = count / GMAIL_DAILY_LIMIT >= WARN_THRESHOLD;
            const isDanger = count >= GMAIL_DAILY_LIMIT;
            const barColor = isDanger
              ? "bg-red-500"
              : isWarning
              ? "bg-orange-400"
              : "bg-emerald-500";
            const textColor = isDanger
              ? "text-red-700"
              : isWarning
              ? "text-orange-700"
              : "text-emerald-700";

            return (
              <div key={account} className="flex flex-col gap-1 min-w-[160px] max-w-[220px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-700 truncate" title={account}>
                    {account}
                  </span>
                  <span className={`text-[11px] font-bold ${textColor} flex items-center gap-0.5 whitespace-nowrap`}>
                    {isDanger && <AlertTriangle className="w-3 h-3" />}
                    {count} / {GMAIL_DAILY_LIMIT}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
