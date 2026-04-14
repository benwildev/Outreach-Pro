"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BulkState,
  clamp,
  normalizeTime,
  localDateString,
  getTomorrowDate,
  readStorageInt,
  formatStatus,
  buildProgressText,
} from "./bulkPanelUtils";
import {
  sendRuntimeMessage,
  BRIDGE_READY_TYPE,
  K_SCHEDULE_TIME,
  K_SCHED_LIMIT,
  K_SCHED_STAGGER,
  K_SCHED_PHASE,
  K_FU1_OVERRIDE,
} from "./extensionBridge";
import { Play, Square, CalendarClock, ChevronDown, ChevronUp, Unlock } from "lucide-react";

const SCHED_COMPOSE_DELAY_MS = 10000;

type SchedPhase = "send" | "followup" | "both" | "followup1" | "followup2";

interface GmailAccount { email: string; accountIndex: number; }

export function BulkSchedulePanel({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [scheduleDate, setScheduleDate] = useState(getTomorrowDate);
  const [scheduleTime, setScheduleTime] = useState("");
  const [limit, setLimit] = useState(50);
  const [staggerMin, setStaggerMin] = useState(3);
  const [schedPhase, setSchedPhase] = useState<SchedPhase>("send");
  const [state, setState] = useState<BulkState>({});
  const [error, setError] = useState("");
  const [hasRuntime, setHasRuntime] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fu1GmailOverride, setFu1GmailOverride] = useState("");
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([]);
  const [gmailAcct, setGmailAcct] = useState("");

  useEffect(() => {
    const schedLimitRaw = typeof window !== "undefined" ? window.localStorage.getItem(K_SCHED_LIMIT) : null;
    const fallbackLimit = schedLimitRaw !== null ? readStorageInt(K_SCHED_LIMIT, 50) : readStorageInt("leadsExtensionBulkLimit", 50);
    setLimit(clamp(fallbackLimit, 1, 500));
    setStaggerMin(clamp(readStorageInt(K_SCHED_STAGGER, 3), 1, 60));
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(K_SCHEDULE_TIME) || "";
      if (saved.includes("T")) {
        const [datePart, timePart] = saved.split("T");
        const today = localDateString(new Date());
        setScheduleDate(datePart && datePart >= today ? datePart : getTomorrowDate());
        setScheduleTime(normalizeTime(timePart || "", ""));
      }
      const savedPhase = window.localStorage.getItem(K_SCHED_PHASE) ?? "send";
      setSchedPhase((["send", "both", "followup", "followup1", "followup2"].includes(savedPhase) ? savedPhase : "send") as SchedPhase);
      const savedOverride = window.localStorage.getItem(K_FU1_OVERRIDE) ?? "";
      setFu1GmailOverride(savedOverride);
    }
    fetch("/api/gmail-accounts")
      .then((r) => r.json())
      .then((d) => { if (d.success && Array.isArray(d.accounts)) setGmailAccounts(d.accounts); })
      .catch(() => {});
  }, []);

  async function refreshState(customError = "") {
    try {
      const response = await sendRuntimeMessage({ action: "getBulkAutomationState" });
      if (response?.success) {
        setHasRuntime(true);
        setState(response.state || {});
        setError(customError || "");
      } else {
        setHasRuntime(false);
        setError(customError || response?.error || "Failed to fetch state");
      }
    } catch (e) {
      setHasRuntime(false);
      setError(customError || (e instanceof Error ? e.message : "Failed to fetch state"));
    }
  }

  useEffect(() => {
    refreshState();
    const timer = window.setInterval(() => refreshState(), 1800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onBridgeReady(event: MessageEvent) {
      if (event.source !== window) return;
      const message = event.data as { type?: string };
      if (message?.type === BRIDGE_READY_TYPE) refreshState();
    }
    window.addEventListener("message", onBridgeReady);
    return () => window.removeEventListener("message", onBridgeReady);
  }, []);

  async function doStart() {
    setError("");
    if (!scheduleDate) { setError("Please set a date."); return; }
    if (!scheduleTime) { setError("Please set a time."); return; }
    const combinedSchedule = `${scheduleDate}T${scheduleTime}`;
    const maxLeads = clamp(limit, 1, 500);
    const staggerMinutes = clamp(staggerMin, 1, 60);
    const followupEnabled = schedPhase !== "send";

    window.localStorage.setItem(K_SCHEDULE_TIME, combinedSchedule);
    window.localStorage.setItem(K_SCHED_LIMIT, String(maxLeads));
    window.localStorage.setItem(K_SCHED_STAGGER, String(staggerMinutes));
    window.localStorage.setItem(K_SCHED_PHASE, schedPhase);
    window.localStorage.setItem(K_FU1_OVERRIDE, fu1GmailOverride);

    const showFu1Override = schedPhase === "both" || schedPhase === "followup" || schedPhase === "followup1";

    try {
      const response = await sendRuntimeMessage({
        action: "startBulkAutomation",
        data: {
          campaignId: currentCampaignId ?? "",
          delayMinMs: SCHED_COMPOSE_DELAY_MS,
          delayMaxMs: SCHED_COMPOSE_DELAY_MS,
          limit: maxLeads,
          startPhase: schedPhase,
          followupEnabled,
          windowEnabled: false,
          scheduleSendTime: combinedSchedule,
          scheduleStaggerMs: staggerMinutes * 60 * 1000,
          ...(showFu1Override && fu1GmailOverride ? { fu1GmailOverride } : {}),
          ...(gmailAcct ? { gmailAcct } : {}),
        },
      });
      if (!response?.success) {
        await refreshState(response?.error || "Failed to start bulk scheduling");
        return;
      }
      setHasRuntime(true);
      await refreshState();
    } catch (e) {
      setHasRuntime(false);
      await refreshState(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function releaseLocks() {
    setError("");
    try {
      const response = await fetch("/api/release-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: currentCampaignId }),
      });
      const data = await response.json();
      setError(data.message || (data.success ? "Locks released" : data.error || "Failed to release locks"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to release locks");
    }
  }

  async function doStop() {
    setError("");
    try {
      const response = await sendRuntimeMessage({ action: "stopBulkAutomation" });
      if (!response?.success) {
        await refreshState(response?.error || "Failed to stop");
        return;
      }
      await refreshState();
    } catch (e) {
      await refreshState(e instanceof Error ? e.message : "Action failed");
    }
  }

  const statusValue = String(state.status || "idle").toLowerCase();
  const isActive =
    statusValue === "running" ||
    statusValue === "paused" ||
    statusValue === "stopping" ||
    statusValue === "waiting-window";

  const progressText = useMemo(() => buildProgressText(state, isActive), [state, isActive]);

  const todayStr = localDateString(new Date());

  const statusDot =
    statusValue === "running"
      ? "bg-emerald-500 animate-pulse"
      : statusValue === "paused"
      ? "bg-amber-400"
      : "bg-gray-300";

  const inputClass = "h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent shadow-sm";

  return (
    <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/60 to-orange-50/30 overflow-hidden">
      {/* Panel header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-50/80 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="bg-amber-500 rounded-md p-1">
            <CalendarClock className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-amber-900">Bulk Scheduling</span>
          <span className="text-[10px] text-amber-500 font-medium bg-amber-100 rounded-full px-2 py-0.5">Gmail schedule-send</span>
          <span className={`w-2 h-2 rounded-full ml-1 ${statusDot}`} />
          <span className="text-[11px] text-amber-700 font-medium capitalize">{formatStatus(state.status)}</span>
        </div>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-400" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-400" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 border-t border-amber-100/60">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
            {/* Date + time */}
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 shadow-sm" title="Date and time Gmail will send each email">
              <span className="text-[11px] font-semibold text-gray-600">Send At</span>
              <input
                type="date" value={scheduleDate} min={todayStr}
                onChange={(e) => setScheduleDate(e.target.value)}
                className={inputClass + " w-auto"}
              />
              <input
                type="time" value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value ? normalizeTime(e.target.value, "") : "")}
                className={inputClass + " w-auto"}
              />
            </div>

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-600 font-medium">Limit</span>
              <input
                type="number" min={1} max={500}
                value={limit || ""}
                onChange={(e) => setLimit(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
                onBlur={() => setLimit(clamp(limit, 1, 500))}
                className={inputClass + " w-20"}
              />
            </label>

            <label
              className="flex items-center gap-1.5"
              title="Minutes added between each lead's scheduled send time"
            >
              <span className="text-[11px] text-gray-600 font-medium whitespace-nowrap">Stagger (min)</span>
              <input
                type="number" min={1} max={60}
                value={staggerMin || ""}
                onChange={(e) => setStaggerMin(e.target.value ? Number.parseInt(e.target.value, 10) : 1)}
                onBlur={() => setStaggerMin(clamp(staggerMin || 1, 1, 60))}
                className={inputClass + " w-16"}
              />
            </label>

            {/* Phase picker */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1 shadow-sm">
              <span className="text-[11px] text-gray-500 font-medium pl-1.5 pr-2 whitespace-nowrap">Phase:</span>
              {(["send", "both", "followup", "followup1", "followup2"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSchedPhase(p)}
                  disabled={isActive}
                  className={`h-6 px-2.5 text-[11px] rounded-md font-medium transition-colors whitespace-nowrap ${
                    schedPhase === p
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {p === "send" ? "New only" : p === "both" ? "New + Follow-ups" : p === "followup" ? "Follow-ups only" : p === "followup1" ? "Follow-up 1 only" : "Follow-up 2 only"}
                </button>
              ))}
            </div>

            {/* Source Gmail Acct filter — only process leads sent from this account */}
            {gmailAccounts.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">Source acct</span>
                <select
                  value={gmailAcct}
                  onChange={(e) => setGmailAcct(e.target.value)}
                  disabled={isActive}
                  className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent shadow-sm"
                  title="Only schedule leads whose original cold email was sent from this account"
                >
                  <option value="">All accounts</option>
                  {gmailAccounts.map((a) => (
                    <option key={a.email} value={a.email}>{a.email}</option>
                  ))}
                </select>
              </div>
            )}

            {/* FU1 account override — shown when phase includes FU1 */}
            {(schedPhase === "both" || schedPhase === "followup" || schedPhase === "followup1") && gmailAccounts.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">Send FU1 from</span>
                <select
                  value={fu1GmailOverride}
                  onChange={(e) => setFu1GmailOverride(e.target.value)}
                  disabled={isActive}
                  className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent shadow-sm"
                >
                  <option value="">Campaign default</option>
                  {gmailAccounts.map((a) => (
                    <option key={a.email} value={a.email}>{a.email}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="w-px h-6 bg-amber-200 mx-1" />

            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm"
                className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-sm gap-1.5"
                onClick={doStart} disabled={isActive || !hasRuntime}>
                <Play className="w-3 h-3" /> Start
              </Button>
              <Button type="button" size="sm" variant="outline"
                className="h-8 px-3 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                onClick={doStop} disabled={!isActive || statusValue === "stopping"}>
                <Square className="w-3 h-3" /> Stop
              </Button>
              <Button type="button" size="sm" variant="outline"
                title="Use after an internet drop to release locked leads so scheduling can restart"
                className="h-8 px-3 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 gap-1.5"
                onClick={releaseLocks} disabled={isActive}>
                <Unlock className="w-3 h-3" /> Unlock
              </Button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] text-gray-500">Phase: <span className="font-medium text-gray-700">{state.phase || "send"}</span></span>
            {state.startPhase && state.startPhase !== "send" && (
              <span className="text-[11px] text-amber-600 font-medium">
                ({state.startPhase === "both" ? "new + follow-ups" : state.startPhase === "followup1" ? "follow-up 1 only" : state.startPhase === "followup2" ? "follow-up 2 only" : "all follow-ups"})
              </span>
            )}
            {progressText && <span className="text-[11px] text-gray-500">{progressText}</span>}
            {error && <span className="text-[11px] text-red-600 font-medium">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
