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
} from "./extensionBridge";

const SCHED_COMPOSE_DELAY_MS = 10000;

export function BulkSchedulePanel({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [scheduleDate, setScheduleDate] = useState(getTomorrowDate);
  const [scheduleTime, setScheduleTime] = useState("");
  const [limit, setLimit] = useState(50);
  const [state, setState] = useState<BulkState>({});
  const [error, setError] = useState("");
  const [hasRuntime, setHasRuntime] = useState(false);

  useEffect(() => {
    setLimit(clamp(readStorageInt(K_SCHED_LIMIT, 50), 1, 500));
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(K_SCHEDULE_TIME) || "";
      if (saved.includes("T")) {
        const [datePart, timePart] = saved.split("T");
        setScheduleDate(datePart || getTomorrowDate());
        setScheduleTime(normalizeTime(timePart || "", ""));
      }
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

  async function doStart() {
    setError("");
    if (!scheduleDate) {
      setError("Please set a date to schedule emails.");
      return;
    }
    if (!scheduleTime) {
      setError("Please set a time to schedule emails.");
      return;
    }
    const combinedSchedule = `${scheduleDate}T${scheduleTime}`;
    const maxLeads = clamp(limit, 1, 500);

    window.localStorage.setItem(K_SCHEDULE_TIME, combinedSchedule);
    window.localStorage.setItem(K_SCHED_LIMIT, String(maxLeads));

    try {
      const response = await sendRuntimeMessage({
        action: "startBulkAutomation",
        data: {
          campaignId: currentCampaignId ?? "",
          delayMinMs: SCHED_COMPOSE_DELAY_MS,
          delayMaxMs: SCHED_COMPOSE_DELAY_MS,
          limit: maxLeads,
          followupEnabled: false,
          windowEnabled: false,
          scheduleSendTime: combinedSchedule,
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

  const progressText = useMemo(
    () => buildProgressText(state, isActive),
    [state, isActive]
  );

  const todayStr = localDateString(new Date());

  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber-900">Bulk Scheduling</span>
        <span className="text-amber-500 text-[10px]">(Gmail schedule-send)</span>
        <div
          className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-amber-200"
          title="Set the date and time Gmail will send each email. Both fields are required."
        >
          <span className="text-slate-700 font-medium">Send At:</span>
          <input
            type="date"
            value={scheduleDate}
            min={todayStr}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="h-8 rounded border bg-white px-2 text-xs"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value ? normalizeTime(e.target.value, "") : "")}
            className="h-8 rounded border bg-white px-2 text-xs"
          />
        </div>
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
        <div className="w-px h-6 bg-amber-200 mx-1" />
        <Button
          type="button"
          variant="outline"
          className="h-8 px-3 text-xs border-amber-300 hover:bg-amber-100"
          onClick={doStart}
          disabled={isActive || !hasRuntime}
        >
          Start
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 px-3 text-xs border-amber-300 hover:bg-amber-100"
          onClick={doStop}
          disabled={!isActive || statusValue === "stopping"}
        >
          Stop
        </Button>
      </div>
      <div className="mt-2 text-slate-700">Status: {formatStatus(state.status)} • Phase: {state.phase || "send"}</div>
      <div className="text-slate-600">{progressText}</div>
      {error ? <div className="text-red-600">{error}</div> : null}
    </div>
  );
}
