"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePendingLeads } from "./actions";
import { Trash2 } from "lucide-react";

type BulkState = {
  status?: string;
  phase?: string;
  paused?: boolean;
  stopRequested?: boolean;
  delayMinMs?: number;
  delayMaxMs?: number;
  delayMs?: number;
  limit?: number;
  total?: number;
  currentIndex?: number;
  processed?: number;
  sent?: number;
  followups?: number;
  failed?: number;
  skipped?: number;
  remaining?: number;
  currentLeadId?: string;
  currentRecipientEmail?: string;
  followupEnabled?: boolean;
  windowEnabled?: boolean;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  scheduleSendTime?: string;
  lastError?: string;
};

const K_DELAY_MIN = "leadsExtensionBulkDelayMinMs";
const K_DELAY_MAX = "leadsExtensionBulkDelayMaxMs";
const K_LIMIT = "leadsExtensionBulkLimit";
const K_AUTO_FOLLOWUP = "leadsExtensionBulkAutoFollowup";
const K_WINDOW_ENABLED = "leadsExtensionBulkWindowEnabled";
const K_WINDOW_START = "leadsExtensionBulkWindowStart";
const K_WINDOW_END = "leadsExtensionBulkWindowEnd";
// const K_SCHEDULE_TIME = "leadsExtensionScheduleTime";
const BRIDGE_REQUEST_TYPE = "LEADS_EXTENSION_BRIDGE_REQUEST";
const BRIDGE_RESPONSE_TYPE = "LEADS_EXTENSION_BRIDGE_RESPONSE";
const BRIDGE_READY_TYPE = "LEADS_EXTENSION_BRIDGE_READY";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTime(value: string, fallback: string): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${String(match[1]).padStart(2, "0")}:${String(match[2]).padStart(2, "0")}`;
}

function readStorageInt(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const n = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

async function sendRuntimeMessage(payload: unknown): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Window is not available");
  }
  const p = (payload || {}) as { action?: string; data?: unknown };
  const action = String(p.action || "").trim();
  if (!action) {
    throw new Error("Action is required");
  }
  const requestId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Extension bridge timeout"));
    }, 5000);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) {
        return;
      }
      const message = event.data as {
        type?: string;
        id?: string;
        success?: boolean;
        payload?: any;
      };
      if (!message || message.type !== BRIDGE_RESPONSE_TYPE || message.id !== requestId) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!message.success) {
        reject(new Error(message.payload?.error || "Extension bridge request failed"));
        return;
      }
      resolve(message.payload ?? null);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: BRIDGE_REQUEST_TYPE,
        id: requestId,
        action,
        data: p.data ?? {},
      },
      window.location.origin
    );
  });
}

function formatStatus(value: string | undefined): string {
  const s = String(value || "idle").toLowerCase();
  if (s === "running") return "Running";
  if (s === "paused") return "Paused";
  if (s === "stopping") return "Stopping";
  if (s === "waiting-window") return "Waiting for window";
  if (s === "completed") return "Completed";
  if (s === "failed") return "Failed";
  if (s === "stopped") return "Stopped";
  return "Idle";
}

export function BulkAutomationPanel({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [delayMinSeconds, setDelayMinSeconds] = useState(45);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState(45);
  const [limit, setLimit] = useState(50);
  const [autoFollowup, setAutoFollowup] = useState(false);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");
  const [scheduleTime, setScheduleTime] = useState("");
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
      // const savedSchedule = window.localStorage.getItem(K_SCHEDULE_TIME) || "";
      // setScheduleTime(savedSchedule ? normalizeTime(savedSchedule, "") : "");
      setScheduleTime("");
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
        /*
        if (scheduleTime) {
          window.localStorage.setItem(K_SCHEDULE_TIME, normalizeTime(scheduleTime, ""));
        } else {
          window.localStorage.removeItem(K_SCHEDULE_TIME);
        }
        */

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
            // scheduleSendTime: scheduleTime ? normalizeTime(scheduleTime, "") : undefined,
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

  const progressText = useMemo(() => {
    const processed = Number(state.processed || 0);
    const total = Number(state.total || 0);
    const sent = Number(state.sent || 0);
    const followups = Number(state.followups || 0);
    const failed = Number(state.failed || 0);
    const skipped = Number(state.skipped || 0);
    const remaining = Math.max(total - processed, 0);
    let text = `Processed ${processed}/${total} • Sent ${sent} • Follow-ups ${followups} • Failed ${failed}`;
    if (skipped > 0) text += ` • Skipped ${skipped}`;
    if (isActive) text += ` • Remaining ${remaining}`;
    if (state.currentRecipientEmail) text += ` • Current ${state.currentRecipientEmail}`;
    return text;
  }, [state, isActive]);

  return (
    <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-blue-900">Bulk Automation</span>
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
        {/*
        <div className="w-px h-6 bg-blue-200 mx-1"></div>
        <label className="inline-flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-200" title="Leave blank to send immediately">
          <span className="text-slate-700 font-medium">Schedule At:</span>
          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value ? normalizeTime(e.target.value, "") : "")} className="h-8 rounded border bg-white px-2 text-xs" />
        </label>
        */}
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("start")} disabled={isActive || !hasRuntime}>Start</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("pause")} disabled={!(statusValue === "running" || statusValue === "waiting-window")}>Pause</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("resume")} disabled={statusValue !== "paused"}>Resume</Button>
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => doAction("stop")} disabled={!isActive || statusValue === "stopping"}>Stop</Button>
        <div className="w-px h-6 bg-blue-200 mx-1"></div>
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-3 text-xs bg-white hover:bg-slate-50 border-blue-200 text-blue-700"
          onClick={handleManualReplyCheck}
          disabled={isActive || isCheckingReplies || !hasRuntime}
        >
          {isCheckingReplies ? "Checking..." : "Check Replies"}
        </Button>
        <div className="flex-1"></div>
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
