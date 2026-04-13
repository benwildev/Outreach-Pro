import { CalendarClock } from "lucide-react";

interface AccountStat {
  account: string;
  count: number;
}

interface FU1ScheduledTrackerProps {
  accountStats: AccountStat[];
}

export function FU1ScheduledTracker({ accountStats }: FU1ScheduledTrackerProps) {
  if (accountStats.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-amber-100 rounded-lg p-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-sm font-semibold text-gray-700">FU1 Scheduled Today</span>
          <span className="text-xs text-gray-400 font-normal">per Gmail account</span>
        </div>
        <div className="flex flex-wrap gap-5">
          {accountStats.map(({ account, count }) => (
            <div key={account} className="flex-1 min-w-[180px] max-w-[260px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600 truncate" title={account}>
                  {account}
                </span>
                <span className="inline-flex items-center text-[11px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
                  {count} scheduled
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.round((count / 500) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{count} of today&apos;s FU1 batch</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
