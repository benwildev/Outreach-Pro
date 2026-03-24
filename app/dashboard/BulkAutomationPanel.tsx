"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePendingLeads } from "./actions";
import { Trash2 } from "lucide-react";
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
  K_AUTO_FOLLOWUP,
  K_WINDOW_ENABLED,
  K_WINDOW_START,
  K_WINDOW_END,
} from "./extensionBridge";

export function BulkAutomationPanel({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [delayMinSeconds, setDelayMinSeconds] = useState(45);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState(45);
  const [limit, setLimit] = useState(50);
  const [autoFollowup, setAutoFollowup] = useState(false);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");
  const [state, setState] = useState<BulkState>({});
  const [error, setError] = useState("");
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [hasRuntime, setHasRuntime] = useState(false);

  useEffect(() => {
    setDelayMinSeconds(clamp(Math.round(readStorageInt(K_DELAY_MIN, 45000) / 1000), 5, 600));
    setDelayMaxSeconds(clamp(Math.round(readStorageInt(K_DELAY_MAX, 45000) / 1000), 5, 600));
    setLimit(clamp(readStorageInt(K_LIMIT, 50), 1, 500));
    if (typeof window !== "undefined") {
      setAutoFollowup((window.localStorage.getItem(K_AUTO_FOLLOWUP) ?? "0") === "1");
      setWindowEnabled((window.localStorage.getItem(K_WINDOW_ENABLED) ?? "0") === "1");
      setWindowStart(normalizeTime(window.localStorage.getItem(K_WINDOW_START) ?? "", "09:00"));
      setWindowEnd(normalizeTime(window.localStorage.getItem(K_WINDOW_END) ?? "", "18:00"));
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
    const timer = window.setInterval(() => {
      refreshState();
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onBridgeReady(event: MessageEvent) {
      if (event.source !== window) return;
      const message = event.data as { type?: string };
      if (message?.type === BRIDGE_READY_TYPE) {
        refreshState();
      }
    }
    window.addEventListener("message", onBridgeReady);
    return () => window.removeEventListener("message", onBridgeReady);
  }, []);

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
        window.localStorage.setItem(K_AUTO_FOLLOWUP, autoFollowup ? "1" : "0");
        window.localStorage.setItem(K_WINDOW_ENABLED, windowEnabled ? "1" : "0");
        window.localStorage.setItem(K_WINDOW_START, start);
        window.localStorage.setItem(K_WINDOW_END, end);

        const response = await sendRuntimeMessage({
          action: "startBulkAutomation",
          data: {
            campaignId: currentCampaignId ?? "",
            delayMinMs: minSec * 1000,
            delayMaxMs: maxSec * 1000,
            limit: maxLeads,
            followupEnabled: autoFollowup,
            windowEnabled,
            sendWindowStart: start,
            sendWindowEnd: end,
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

  async function handleManualReplyCheck() {
    setIsCheckingReplies(true);
    setError("");
    try {
      const response = await sendRuntimeMessage({ action: "triggerReplySweep" });
      if (response?.success) {
        alert(`Reply check completed: checked ${response.checked || 0}, marked ${response.marked || 0} as replied.`);
      } else {
        setError(response?.error || "Failed to trigger reply check");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger reply check");
    } finally {
      setIsCheckingReplies(false);
    }
  }

  const statusValue = String(state.status || "idle").toLowerCase();
  const isActive =
    statusValue === "running" ||
    statusValue === "paused" ||
    statusValue === "stopping" ||
    statusValue === "waiting-window";

  const progressText = useMemo(
    () => buildProgressText(state, isActive),
    [state, isActive]
  );

  return (
    <div className="mb-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-blue-900">Bulk Automation</span>
        <span className="text-blue-400 text-[10px]">(sends immediately)</span>
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-700">Delay Min (sec)</span>
          <input
            type="number"
            min={5}
            max={600}
            value={delayMinSeconds || ""}
            onChange={(e) => setDelayMinSeconds(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
            onBlur={() => setDelayMinSeconds(clamp(delayMinSeconds, 5, 600))}
            className="h-8 w-20 rounded border bg-white px-2 text-xs"
          />
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-700">Delay Max (sec)</span>
          <input
            type="number"
            min={5}
            max={600}
            value={delayMaxSeconds || ""}
            onChange={(e) => setDelayMaxSeconds(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
            onBlur={() => setDelayMaxSeconds(clamp(delayMaxSeconds, 5, 600))}
            className="h-8 w-20 rounded border bg-white px-2 text-xs"
          />
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-700">Limit</span>
          <input
            type="number"
            min={1}
            max={500}
            value={limit || ""}
            onChange={(e) => setLimit(e.target.value ? Number.parseInt(e.target.value, 10) : 0)}
            onBlur={() => setLimit(clamp(limit, 1, 500))}
            className="h-8 w-20 rounded border bg-white px-2 text-xs"
          />
        </label>
        <label className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1">
          <input type="checkbox" checked={autoFollowup} onChange={(e) => setAutoFollowup(e.target.checked)} />
          <span className="text-slate-700">Auto follow-ups</span>
        </label>
        <label className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1">
          <input type="checkbox" checked={windowEnabled} onChange={(e) => setWindowEnabled(e.target.checked)} />
          <span className="text-slate-700">Send window</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-700">From</span>
          <input type="time" value={windowStart} onChange={(e) => setWindowStart(normalizeTime(e.target.value, "09:00"))} className="h-8 rounded border bg-white px-2 text-xs" />
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-700">To</span>
          <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(normalizeTime(e.target.value, "18:00"))} className="h-8 rounded border bg-white px-2 text-xs" />
        </label>
        <div className="w-px h-6 bg-blue-200 mx-1" />
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("start")} disabled={isActive || !hasRuntime}>Start</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("pause")} disabled={!(statusValue === "running" || statusValue === "waiting-window")}>Pause</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("resume")} disabled={statusValue !== "paused"}>Resume</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("stop")} disabled={!isActive || statusValue === "stopping"}>Stop</Button>
        <div className="w-px h-6 bg-blue-200 mx-1" />
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-3 text-xs bg-white hover:bg-slate-50 border-blue-200 text-blue-700"
          onClick={handleManualReplyCheck}
          disabled={isActive || isCheckingReplies || !hasRuntime}
        >
          {isCheckingReplies ? "Checking..." : "Check Replies"}
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
          onClick={async () => {
            if (window.confirm("Are you sure you want to delete ALL pending leads for this campaign? This cannot be undone.")) {
              await deletePendingLeads(currentCampaignId);
              window.location.reload();
            }
          }}
          disabled={isActive}
        >
          <Trash2 className="w-3 h-3" />
          Clear Pending Leads
        </Button>
      </div>
      <div className="mt-2 text-slate-700">Status: {formatStatus(state.status)} • Phase: {state.phase || "send"}</div>
      <div className="text-slate-600">{progressText}</div>
      {error ? <div className="text-red-600">{error}</div> : null}
    </div>
  );
}
