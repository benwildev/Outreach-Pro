"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deletePendingLeads } from "./actions";
import { sendRuntimeMessage, BRIDGE_READY_TYPE } from "./extensionBridge";

export function BulkActionsRow({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [hasRuntime, setHasRuntime] = useState(false);
  const [error, setError] = useState("");

  async function refreshState() {
    try {
      const response = await sendRuntimeMessage({ action: "getBulkAutomationState" });
      if (response?.success) {
        setHasRuntime(true);
        const sv = String(response.state?.status || "idle").toLowerCase();
        setIsActive(
          sv === "running" || sv === "paused" || sv === "stopping" || sv === "waiting-window"
        );
      } else {
        setHasRuntime(false);
      }
    } catch {
      setHasRuntime(false);
    }
  }

  useEffect(() => {
    refreshState();
    const timer = window.setInterval(refreshState, 1800);
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

  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 px-3 py-1 text-xs border-b border-slate-100 bg-slate-50">
      <Button
        type="button"
        variant="secondary"
        className="h-7 px-3 text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-700"
        onClick={handleManualReplyCheck}
        disabled={isActive || isCheckingReplies || !hasRuntime}
      >
        {isCheckingReplies ? "Checking..." : "Check Replies"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
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
      {error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}
