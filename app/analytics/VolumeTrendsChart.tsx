"use client";

import { useState } from "react";

interface DayData {
  date: string;
  sent: number;
  followup1: number;
  followup2: number;
  scheduled: number;
  replied: number;
  replyRate: number;
}

interface TooltipState {
  day: DayData;
  x: number;
  y: number;
}

export default function VolumeTrendsChart({ data }: { data: DayData[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (data.filter((d) => d.sent + d.followup1 + d.followup2 + d.scheduled > 0).length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No data for this period.</p>;
  }

  const maxVal = Math.max(
    ...data.map((d) => d.sent + d.followup1 + d.followup2 + d.scheduled),
    1
  );

  const pct = (v: number) => Math.max(2, Math.round((v / maxVal) * 100));

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, day: DayData) => {
    const rect = (e.currentTarget.closest(".chart-root") as HTMLElement)?.getBoundingClientRect();
    const colRect = e.currentTarget.getBoundingClientRect();
    const x = colRect.left - (rect?.left ?? 0) + colRect.width / 2;
    const y = colRect.top - (rect?.top ?? 0);
    setTooltip({ day, x, y });
  };

  return (
    <div className="chart-root relative">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <div className="bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3 text-xs min-w-[160px] border border-gray-700">
            <div className="font-bold text-gray-300 mb-2 border-b border-gray-700 pb-1.5">{tooltip.day.date}</div>
            <div className="space-y-1">
              {tooltip.day.sent > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block shrink-0" />
                    Sent
                  </span>
                  <span className="font-bold text-indigo-300">{tooltip.day.sent}</span>
                </div>
              )}
              {tooltip.day.scheduled > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block shrink-0" />
                    Scheduled
                  </span>
                  <span className="font-bold text-amber-300">{tooltip.day.scheduled}</span>
                </div>
              )}
              {tooltip.day.followup1 > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block shrink-0" />
                    Follow-up 1
                  </span>
                  <span className="font-bold text-emerald-300">{tooltip.day.followup1}</span>
                </div>
              )}
              {tooltip.day.followup2 > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-violet-400 inline-block shrink-0" />
                    Follow-up 2
                  </span>
                  <span className="font-bold text-violet-300">{tooltip.day.followup2}</span>
                </div>
              )}
              {tooltip.day.replied > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-teal-400 inline-block shrink-0" />
                    Replied
                  </span>
                  <span className="font-bold text-teal-300">{tooltip.day.replied}</span>
                </div>
              )}
              {tooltip.day.replyRate > 0 && (
                <div className="flex items-center justify-between gap-4 pt-1 mt-1 border-t border-gray-700">
                  <span className="text-gray-400">Reply rate</span>
                  <span className="font-bold text-white">{tooltip.day.replyRate}%</span>
                </div>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-900" />
          </div>
        </div>
      )}

      {/* Chart bars */}
      <div className="overflow-x-auto pb-1">
        <div
          className="flex items-end gap-1"
          style={{ minWidth: `${data.length * 28}px` }}
          onMouseLeave={() => setTooltip(null)}
        >
          {data.map((d) => {
            const total = d.sent + d.followup1 + d.followup2 + d.scheduled;
            const hasData = total > 0 || d.replied > 0;
            return (
              <div
                key={d.date}
                className={`flex-1 flex flex-col items-center gap-0 cursor-pointer group transition-opacity ${hasData ? "opacity-100" : "opacity-30"}`}
                onMouseEnter={(e) => handleMouseEnter(e, d)}
              >
                {/* Stacked bar */}
                <div className="w-full flex flex-col-reverse h-20 justify-end rounded-t-sm overflow-hidden">
                  {d.sent > 0 && (
                    <div
                      className="w-full bg-indigo-300 group-hover:bg-indigo-400 transition-colors"
                      style={{ height: `${pct(d.sent)}%` }}
                    />
                  )}
                  {d.scheduled > 0 && (
                    <div
                      className="w-full bg-amber-300 group-hover:bg-amber-400 transition-colors"
                      style={{ height: `${pct(d.scheduled)}%` }}
                    />
                  )}
                  {d.followup1 > 0 && (
                    <div
                      className="w-full bg-emerald-300 group-hover:bg-emerald-400 transition-colors"
                      style={{ height: `${pct(d.followup1)}%` }}
                    />
                  )}
                  {d.followup2 > 0 && (
                    <div
                      className="w-full bg-violet-300 group-hover:bg-violet-400 transition-colors"
                      style={{ height: `${pct(d.followup2)}%` }}
                    />
                  )}
                  {d.replied > 0 && (
                    <div
                      className="w-full bg-teal-400 group-hover:bg-teal-500 transition-colors"
                      style={{ height: `${pct(d.replied)}%` }}
                    />
                  )}
                </div>
                {/* Date label */}
                <span className="text-[8px] text-gray-400 mt-1 rotate-45 origin-left whitespace-nowrap">
                  {d.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-300 inline-block" /> Sent</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-300 inline-block" /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-300 inline-block" /> Follow-up 1</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-violet-300 inline-block" /> Follow-up 2</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-400 inline-block" /> Replied</span>
      </div>
    </div>
  );
}
