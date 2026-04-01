"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface DayData {
  sent: number;
  scheduled: number;
  followup1: number;
  followup2: number;
  replied: number;
  futureScheduled: number;
}

type CalendarDays = Record<string, DayData>;

function pad(n: number) { return String(n).padStart(2, "0"); }
function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

interface DayCellProps {
  dateStr: string;
  dayNum: number;
  data?: DayData;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
}

function DayCell({ dateStr, dayNum, data, isToday, isFuture }: DayCellProps) {
  const total =
    (data?.sent ?? 0) +
    (data?.scheduled ?? 0) +
    (data?.followup1 ?? 0) +
    (data?.followup2 ?? 0) +
    (data?.futureScheduled ?? 0);
  const hasData = total > 0 || (data?.replied ?? 0) > 0;

  return (
    <div
      title={
        hasData
          ? [
              data?.sent ? `Sent: ${data.sent}` : "",
              data?.scheduled ? `Queued: ${data.scheduled}` : "",
              data?.followup1 ? `FU1: ${data.followup1}` : "",
              data?.followup2 ? `FU2: ${data.followup2}` : "",
              data?.futureScheduled ? `Upcoming: ${data.futureScheduled}` : "",
              data?.replied ? `Replied: ${data.replied}` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : dateStr
      }
      className={[
        "relative rounded-xl p-1.5 min-h-[72px] flex flex-col transition-all border",
        isToday
          ? "bg-indigo-600 border-indigo-700 text-white shadow-lg"
          : isFuture && hasData
          ? "bg-amber-50 border-amber-200 hover:border-amber-400"
          : hasData
          ? "bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm"
          : "bg-gray-50 border-gray-100",
      ].join(" ")}
    >
      {/* Day number */}
      <span
        className={[
          "text-xs font-bold mb-1 self-start leading-none",
          isToday ? "text-white" : "text-gray-500",
        ].join(" ")}
      >
        {dayNum}
      </span>

      {/* Data pills */}
      {hasData && (
        <div className="flex flex-col gap-0.5 mt-auto">
          {/* Sent (initial) */}
          {(data?.sent ?? 0) > 0 && (
            <span className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${isToday ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"}`}>
              ✉ {data!.sent}
            </span>
          )}
          {/* Scheduled / queued on this date */}
          {(data?.scheduled ?? 0) > 0 && (
            <span className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${isToday ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
              ⏳ {data!.scheduled}
            </span>
          )}
          {/* FU1 */}
          {(data?.followup1 ?? 0) > 0 && (
            <span className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${isToday ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>
              ↩ FU1 {data!.followup1}
            </span>
          )}
          {/* FU2 */}
          {(data?.followup2 ?? 0) > 0 && (
            <span className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${isToday ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"}`}>
              ↩ FU2 {data!.followup2}
            </span>
          )}
          {/* Future scheduled (upcoming) */}
          {(data?.futureScheduled ?? 0) > 0 && (
            <span className="text-[10px] font-bold leading-none px-1 py-0.5 rounded bg-orange-100 text-orange-700">
              📅 {data!.futureScheduled}
            </span>
          )}
          {/* Replied */}
          {(data?.replied ?? 0) > 0 && (
            <span className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${isToday ? "bg-white/20 text-white" : "bg-teal-100 text-teal-700"}`}>
              ✓ {data!.replied}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScheduleCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [days, setDays] = useState<CalendarDays>({});
  const [loading, setLoading] = useState(false);

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule-calendar?year=${y}&month=${m}`);
      const json = await res.json();
      if (json.success) setDays(json.days);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(year, month); }, [year, month, fetchData]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);

  // Build grid cells: empty leading cells + day cells
  const cells: Array<{ dayNum: number; dateStr: string } | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      dayNum: i + 1,
      dateStr: dayKey(year, month, i + 1),
    })),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  // Monthly summary
  const monthlySent = Object.values(days).reduce((s, d) => s + (d.sent ?? 0), 0);
  const monthlyFU1 = Object.values(days).reduce((s, d) => s + (d.followup1 ?? 0), 0);
  const monthlyFU2 = Object.values(days).reduce((s, d) => s + (d.followup2 ?? 0), 0);
  const monthlyScheduled = Object.values(days).reduce((s, d) => s + (d.futureScheduled ?? 0), 0);
  const monthlyReplied = Object.values(days).reduce((s, d) => s + (d.replied ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          Schedule Calendar
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
            Today
          </button>
          <span className="text-sm font-bold text-gray-800 min-w-[120px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monthly summary pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">✉ Sent: {monthlySent}</span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">↩ FU1: {monthlyFU1}</span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100">↩ FU2: {monthlyFU2}</span>
        {monthlyScheduled > 0 && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-100">📅 Upcoming: {monthlyScheduled}</span>
        )}
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">✓ Replied: {monthlyReplied}</span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={`grid grid-cols-7 gap-1 transition-opacity ${loading ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`empty-${i}`} className="min-h-[72px] rounded-xl bg-gray-50/50" />
          ) : (
            <DayCell
              key={cell.dateStr}
              dateStr={cell.dateStr}
              dayNum={cell.dayNum}
              data={days[cell.dateStr]}
              isToday={cell.dateStr === todayStr}
              isFuture={cell.dateStr > todayStr}
              isPast={cell.dateStr < todayStr}
            />
          )
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-50 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-100 inline-block" /> Sent (initial)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 inline-block" /> Queued</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 inline-block" /> Follow-up 1</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-100 inline-block" /> Follow-up 2</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-100 inline-block" /> Upcoming scheduled</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-teal-100 inline-block" /> Replied</span>
      </div>
    </div>
  );
}
