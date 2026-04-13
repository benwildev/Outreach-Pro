"use client";

import { useState, useCallback, useEffect } from "react";
import { Calendar, Copy, Check, RefreshCw } from "lucide-react";

function todayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

interface Sender {
  email: string;
  count: number;
  initial: number;
  followup1: number;
  followup2: number;
}

interface ReportData {
  date: string;
  total: number;
  totalInitial: number;
  totalFollowup1: number;
  totalFollowup2: number;
  senders: Sender[];
}

export default function DailyReportCard() {
  const [date, setDate] = useState(todayISODate());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-report?date=${d}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError("Failed to load report.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(todayISODate());
  }, [fetchReport]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDate(val);
    if (val) fetchReport(val);
  };

  const handleLoad = () => {
    if (date) fetchReport(date);
  };

  const copyReport = () => {
    if (!data) return;
    const label = formatDateLabel(data.date);
    const lines = [
      `*Email Outreach Schedule (${label})= ${data.total}`,
      "",
      ...data.senders.map((s) => `${s.email}- ${s.count}`),
      "",
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          Daily Report
        </h2>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input
          type="date"
          value={date}
          onChange={handleDateChange}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={handleLoad}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-4">{error}</p>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Totals summary with step breakdown */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-1">
              {formatDateLabel(data.date)}
            </div>
            <div className="text-3xl font-black text-indigo-700">{data.total}</div>
            <div className="text-xs text-indigo-400 mt-0.5 mb-3">emails sent / scheduled</div>

            {/* Step breakdown pills */}
            {data.total > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.totalInitial > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    Initial: {data.totalInitial}
                  </span>
                )}
                {data.totalFollowup1 > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Follow-up 1: {data.totalFollowup1}
                  </span>
                )}
                {data.totalFollowup2 > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    Follow-up 2: {data.totalFollowup2}
                  </span>
                )}
              </div>
            )}
          </div>

          {data.senders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No emails found for this date.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.senders.map((s) => (
                <div key={s.email} className="py-2.5">
                  {/* Sender row */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[70%]">{s.email}</span>
                    <span className="text-sm font-bold text-indigo-600 shrink-0">{s.count}</span>
                  </div>
                  {/* Step sub-row */}
                  {(s.initial > 0 || s.followup1 > 0 || s.followup2 > 0) && (
                    <div className="flex gap-2 mt-1">
                      {s.initial > 0 && (
                        <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">
                          Init: {s.initial}
                        </span>
                      )}
                      {s.followup1 > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                          FU1: {s.followup1}
                        </span>
                      )}
                      {s.followup2 > 0 && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                          FU2: {s.followup2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.senders.length > 0 && (
            <button
              onClick={copyReport}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Report
                </>
              )}
            </button>
          )}

          {data.senders.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs text-gray-500 whitespace-pre-wrap leading-relaxed border border-gray-100">
              {`*Email Outreach Schedule (${formatDateLabel(data.date)})= ${data.total}\n\n${data.senders.map((s) => `${s.email}- ${s.count}`).join("\n")}`}
            </div>
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-8 text-sm text-gray-400">
          Select a date and click Load to generate the report.
        </div>
      )}
    </div>
  );
}
