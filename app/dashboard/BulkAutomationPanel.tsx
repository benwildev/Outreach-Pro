"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BulkState,
  clamp,
  normalizeTime,
  readStorageInt,
  formatStatus,
  buildProgressText,
} from "./bulkPanelUtils";
import {
  sendRuntimeMessage,
  BRIDGE_READY_TYPE,
  K_DELAY_MIN,
  K_DELAY_MAX,
  K_LIMIT,
  K_START_PHASE,
  K_WINDOW_ENABLED,
  K_WINDOW_START,
  K_WINDOW_END,
  K_DOMAIN_THROTTLE,
} from "./extensionBridge";
import { Play, Pause, RotateCcw, Square, Zap, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

export function BulkAutomationPanel({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [delayMinSeconds, setDelayMinSeconds] = useState(45);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState(45);
  const [limit, setLimit] = useState(50);
  const [startPhase, setStartPhase] = useState<"send" | "followup" | "both" | "followup1" | "followup2">("send");
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");
  const [domainThrottle, setDomainThrottle] = useState(0);
  const [state, setState] = useState<BulkState>({});
  const [error, setError] = useState("");
  const [hasRuntime, setHasRuntime] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setDelayMinSeconds(clamp(Math.round(readStorageInt(K_DELAY_MIN, 45000) / 1000), 5, 600));
    setDelayMaxSeconds(clamp(Math.round(readStorageInt(K_DELAY_MAX, 45000) / 1000), 5, 600));
    setLimit(clamp(readStorageInt(K_LIMIT, 50), 1, 500));
    if (typeof window !== "undefined") {
      const savedPhase = window.localStorage.getItem(K_START_PHASE) ?? "send";
      setStartPhase(["send", "both", "followup", "followup1", "followup2"].includes(savedPhase) ? (savedPhase as any) : "send");
      setWindowEnabled((window.localStorage.getItem(K_WINDOW_ENABLED) ?? "0") === "1");
      setWindowStart(normalizeTime(window.localStorage.getItem(K_WINDOW_START) ?? "", "09:00"));
      setWindowEnd(normalizeTime(window.localStorage.getItem(K_WINDOW_END) ?? "", "18:00"));
      setDomainThrottle(Math.max(0, readStorageInt(K_DOMAIN_THROTTLE, 0)));
    }
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

  async function retryFailed() {
    setError("");
    try {
      const response = await fetch("/api/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: currentCampaignId }),
      });
      const data = await response.json();
      if (data.success) {
        setError(data.count > 0
          ? `${data.count} failed lead(s) reset to pending — click Start to retry`
          : "No failed leads to retry");
      } else {
        setError(data.error || "Failed to reset leads");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset leads");
    }
  }

  async function doAction(action: "start" | "pause" | "resume" | "stop") {
    setError("");
    try {
      if (action === "start") {
        const minSec = clamp(delayMinSeconds, 5, 600);
        const maxSec = clamp(Math.max(delayMaxSeconds, minSec), 5, 600);
        const maxLeads = clamp(limit, 1, 500);
        const start = normalizeTime(windowStart, "09:00");
        const end = normalizeTime(windowEnd, "18:00");

        window.localStorage.setItem(K_DELAY_MIN, String(minSec * 1000));
        window.localStorage.setItem(K_DELAY_MAX, String(maxSec * 1000));
        window.localStorage.setItem(K_LIMIT, String(maxLeads));
        window.localStorage.setItem(K_START_PHASE, startPhase);
        window.localStorage.setItem(K_WINDOW_ENABLED, windowEnabled ? "1" : "0");
        window.localStorage.setItem(K_WINDOW_START, start);
        window.localStorage.setItem(K_WINDOW_END, end);
        const throttle = Math.max(0, domainThrottle);
        window.localStorage.setItem(K_DOMAIN_THROTTLE, String(throttle));

        const response = await sendRuntimeMessage({
          action: "startBulkAutomation",
          data: {
            campaignId: currentCampaignId ?? "",
            delayMinMs: minSec * 1000,
            delayMaxMs: maxSec * 1000,
            limit: maxLeads,
            startPhase,
            windowEnabled,
            sendWindowStart: start,
            sendWindowEnd: end,
            domainThrottle: throttle,
          },
        });
        if (!response?.success) {
          await refreshState(response?.error || "Failed to start automation");
          return;
        }
      } else {
        const msgAction =
          action === "pause"
            ? "pauseBulkAutomation"
            : action === "resume"
              ? "resumeBulkAutomation"
              : "stopBulkAutomation";
        const response = await sendRuntimeMessage({ action: msgAction });
        if (!response?.success) {
          await refreshState(response?.error || `Failed to ${action}`);
          return;
        }
      }
      setHasRuntime(true);
      await refreshState();
    } catch (e) {
      setHasRuntime(false);
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

  const statusDot =
    statusValue === "running"
      ? "bg-emerald-500 animate-pulse"
      : statusValue === "paused"
      ? "bg-amber-400"
      : statusValue === "stopping"
      ? "bg-orange-400"
      : "bg-gray-300";

  const inputClass = "h-8 w-20 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm";

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-blue-50/40 overflow-hidden">
      {/* Panel header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50/80 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-500 rounded-md p-1">
            <Zap className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-indigo-900">Bulk Automation</span>
          <span className="text-[10px] text-indigo-400 font-medium bg-indigo-100 rounded-full px-2 py-0.5">sends immediately</span>
          <span className={`w-2 h-2 rounded-full ml-1 ${statusDot}`} />
          <span className="text-[11px] text-indigo-700 font-medium capitalize">{formatStatus(state.status)}</span>
        </div>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-indigo-400" /> : <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 border-t border-indigo-100/60">
          {/* Config grid */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-600 font-medium whitespace-nowrap">Delay Min (s)</span>
              <input
                type="number" min={5} max={600}
                value={delayMinSeconds || ""}
                onChange={(e) => setDelayMinSeconds(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
                onBlur={() => setDelayMinSeconds(clamp(delayMinSeconds, 5, 600))}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-600 font-medium whitespace-nowrap">Delay Max (s)</span>
              <input
                type="number" min={5} max={600}
                value={delayMaxSeconds || ""}
                onChange={(e) => setDelayMaxSeconds(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
                onBlur={() => setDelayMaxSeconds(clamp(delayMaxSeconds, 5, 600))}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-600 font-medium">Limit</span>
              <input
                type="number" min={1} max={500}
                value={limit || ""}
                onChange={(e) => setLimit(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
                onBlur={() => setLimit(clamp(limit, 1, 500))}
                className={inputClass}
              />
            </label>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1 shadow-sm">
              <span className="text-[11px] text-gray-500 font-medium pl-1.5 pr-2 whitespace-nowrap">Phase:</span>
              {(["send", "both", "followup", "followup1", "followup2"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStartPhase(p)}
                  disabled={isActive}
                  className={`h-6 px-2.5 text-[11px] rounded-md font-medium transition-colors whitespace-nowrap ${
                    startPhase === p
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {p === "send" ? "New only" : p === "both" ? "New + Follow-ups" : p === "followup" ? "All Follow-ups" : p === "followup1" ? "Follow-up 1" : "Follow-up 2"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors">
              <input type="checkbox" checked={windowEnabled} onChange={(e) => setWindowEnabled(e.target.checked)} className="rounded text-indigo-600 w-3 h-3" />
              <span className="text-[11px] text-gray-600 font-medium whitespace-nowrap">Send window</span>
            </label>
            {windowEnabled && (
              <>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">From</span>
                  <input type="time" value={windowStart} onChange={(e) => setWindowStart(normalizeTime(e.target.value, "09:00"))} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">To</span>
                  <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(normalizeTime(e.target.value, "18:00"))} className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </>
            )}

            {/* Domain throttle */}
            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Domain limit</span>
              <input
                type="number"
                min={0}
                max={100}
                value={domainThrottle}
                onChange={(e) => setDomainThrottle(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                disabled={isActive}
                placeholder="0=off"
                className="w-14 h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              />
            </label>

            {/* Divider */}
            <div className="w-px h-6 bg-indigo-200 mx-1" />

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm"
                className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm gap-1.5"
                onClick={() => doAction("start")} disabled={isActive || !hasRuntime}>
                <Play className="w-3 h-3" /> Start
              </Button>
              <Button type="button" size="sm" variant="outline"
                className="h-8 px-3 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5"
                onClick={() => doAction("pause")} disabled={!(statusValue === "running" || statusValue === "waiting-window")}>
                <Pause className="w-3 h-3" /> Pause
              </Button>
              <Button type="button" size="sm" variant="outline"
                className="h-8 px-3 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5"
                onClick={() => doAction("resume")} disabled={statusValue !== "paused"}>
                <RotateCcw className="w-3 h-3" /> Resume
              </Button>
              <Button type="button" size="sm" variant="outline"
                className="h-8 px-3 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                onClick={() => doAction("stop")} disabled={!isActive || statusValue === "stopping"}>
                <Square className="w-3 h-3" /> Stop
              </Button>
              {(state.failed || 0) > 0 && (
                <Button type="button" size="sm" variant="outline"
                  className="h-8 px-3 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 gap-1.5"
                  onClick={retryFailed} disabled={isActive}>
                  <RefreshCw className="w-3 h-3" /> Retry Failed ({state.failed})
                </Button>
              )}
            </div>
          </div>

          {/* Status / progress */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] text-gray-500">Phase: <span className="font-medium text-gray-700">{state.phase || "send"}</span></span>
            {state.startPhase && state.startPhase !== "send" && (
              <span className="text-[11px] text-indigo-500 font-medium">
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
