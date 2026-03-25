"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Sheet, Copy, Check, X, Square, Power } from "lucide-react";
import { deletePendingLeads } from "./actions";
import { sendRuntimeMessage, BRIDGE_READY_TYPE } from "./extensionBridge";

export function BulkActionsRow({ currentCampaignId }: { currentCampaignId: string | null }) {
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepDisabled, setSweepDisabled] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [hasRuntime, setHasRuntime] = useState(false);
  const [error, setError] = useState("");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncCampaign, setSyncCampaign] = useState<{ name: string; googleSheetId: string | null; totalLeads: number } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function refreshSweepState() {
    try {
      const res = await sendRuntimeMessage({ action: "getReplySweepState" });
      if (res?.success) {
        setSweepRunning(!!res.running);
        setSweepDisabled(!!res.disabled);
      }
    } catch {
      // extension not available
    }
  }

  useEffect(() => {
    refreshState();
    refreshSweepState();
    const timer = window.setInterval(() => {
      refreshState();
      refreshSweepState();
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onBridgeReady(event: MessageEvent) {
      if (event.source !== window) return;
      const message = event.data as { type?: string };
      if (message?.type === BRIDGE_READY_TYPE) {
        refreshState();
        refreshSweepState();
      }
    }
    window.addEventListener("message", onBridgeReady);
    return () => window.removeEventListener("message", onBridgeReady);
  }, []);

  async function handleManualReplyCheck() {
    setIsCheckingReplies(true);
    setSweepRunning(true);
    setError("");
    try {
      const response = await sendRuntimeMessage({ action: "triggerReplySweep" });
      if (response?.success) {
        const stoppedNote = response.stopped ? " (stopped early)" : "";
        alert(`Reply check completed${stoppedNote}: checked ${response.checked || 0}, marked ${response.marked || 0} as replied.`);
      } else {
        setError(response?.error || "Failed to trigger reply check");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger reply check");
    } finally {
      setIsCheckingReplies(false);
      setSweepRunning(false);
    }
  }

  async function handleStopSweep() {
    try {
      await sendRuntimeMessage({ action: "stopReplySweep" });
    } catch {
      // ignore
    }
  }

  async function handleToggleAutoCheck() {
    const enable = sweepDisabled;
    try {
      const res = await sendRuntimeMessage({ action: "setReplySweepEnabled", data: { enabled: enable } });
      if (res?.success) {
        setSweepDisabled(!enable);
      }
    } catch {
      setError("Failed to toggle auto reply check");
    }
  }

  async function handleOpenSyncModal() {
    setShowSyncModal(true);
    setSyncCampaign(null);
    if (!currentCampaignId) return;
    setSyncLoading(true);
    try {
      const res = await fetch(`/api/sheets-data?campaignId=${currentCampaignId}`);
      const data = await res.json();
      setSyncCampaign({
        name: data.campaign?.name ?? "",
        googleSheetId: data.campaign?.googleSheetId ?? null,
        totalLeads: data.totalLeads ?? 0,
      });
    } catch {
    } finally {
      setSyncLoading(false);
    }
  }

  // Use the production domain to ensure the generated Apps Script always targets the live server
  const appDomain = process.env.NEXT_PUBLIC_APP_URL || "https://automation.benwil.store";
  const dataUrl = `${appDomain}/api/sheets-data?campaignId=${currentCampaignId ?? "YOUR_CAMPAIGN_ID"}`;

  const appsScript = `// ============================================================
// Benwill Outreach → Google Sheets Sync Script
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Paste this code and click Save
// 4. Run syncBenwillData() (or set a time-based trigger)
// ============================================================

const BENWILL_API_URL = "${dataUrl}";

// Columns to write back (add/remove as needed)
const COLUMNS = {
  EMAIL: "A",       // Column in your sheet that holds email addresses
  STATUS: "B",      // Where to write status (Pending / Sent / Replied / Bounced)
  SENT_AT: "C",     // When the email was sent
  REPLY: "D",       // Whether replied (Yes/No)
  GMAIL_LINK: "E",  // Link to Gmail thread
  NEXT_FOLLOWUP: "F" // Next follow-up date
};

function syncBenwillData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const response = UrlFetchApp.fetch(BENWILL_API_URL);
  const data = JSON.parse(response.getContentText());
  const leads = data.leads || [];

  if (leads.length === 0) {
    SpreadsheetApp.getUi().alert("No lead data found for this campaign.");
    return;
  }

  // Build a map of email -> lead data
  const leadMap = {};
  leads.forEach(function(lead) {
    leadMap[lead.email.toLowerCase().trim()] = lead;
  });

  const lastRow = sheet.getLastRow();
  const emailCol = columnToIndex(COLUMNS.EMAIL);
  let updated = 0;

  for (let row = 2; row <= lastRow; row++) {
    const cellEmail = String(sheet.getRange(row, emailCol).getValue() || "").toLowerCase().trim();
    if (!cellEmail || !leadMap[cellEmail]) continue;

    const lead = leadMap[cellEmail];

    if (COLUMNS.STATUS) sheet.getRange(row, columnToIndex(COLUMNS.STATUS)).setValue(capitalize(lead.status));
    if (COLUMNS.SENT_AT) sheet.getRange(row, columnToIndex(COLUMNS.SENT_AT)).setValue(lead.sentAt ? new Date(lead.sentAt) : "");
    if (COLUMNS.REPLY) sheet.getRange(row, columnToIndex(COLUMNS.REPLY)).setValue(lead.replied);
    if (COLUMNS.GMAIL_LINK && lead.gmailLink) {
      sheet.getRange(row, columnToIndex(COLUMNS.GMAIL_LINK)).setFormula('=HYPERLINK("' + lead.gmailLink + '","Open Thread")');
    }
    if (COLUMNS.NEXT_FOLLOWUP) sheet.getRange(row, columnToIndex(COLUMNS.NEXT_FOLLOWUP)).setValue(lead.nextFollowup ? new Date(lead.nextFollowup) : "");
    updated++;
  }

  SpreadsheetApp.getUi().alert("Sync complete! Updated " + updated + " rows. Last synced: " + new Date().toLocaleString());
}

function columnToIndex(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + col.charCodeAt(i) - 64;
  }
  return n;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}`;

  function handleCopy() {
    navigator.clipboard.writeText(appsScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-2 px-3 py-1 text-xs border-b border-slate-100 bg-slate-50">
        {sweepRunning ? (
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-3 text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 gap-1"
            onClick={handleStopSweep}
          >
            <Square className="w-3 h-3 fill-red-600" />
            Stop Checking
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-3 text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-700"
            onClick={handleManualReplyCheck}
            disabled={isActive || isCheckingReplies || !hasRuntime || sweepDisabled}
          >
            {isCheckingReplies ? "Checking..." : "Check Replies"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className={`h-7 px-3 text-xs gap-1 border ${sweepDisabled ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          onClick={handleToggleAutoCheck}
          disabled={!hasRuntime}
          title={sweepDisabled ? "Auto reply check is OFF — click to enable" : "Auto reply check is ON every 2 hrs — click to disable"}
        >
          <Power className="w-3 h-3" />
          {sweepDisabled ? "Auto Check: OFF" : "Auto Check: ON"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-7 px-3 text-xs bg-white hover:bg-green-50 border border-green-200 text-green-700 gap-1"
          onClick={handleOpenSyncModal}
          disabled={!currentCampaignId}
          title={!currentCampaignId ? "Select a campaign to sync" : "Sync data back to Google Sheets"}
        >
          <Sheet className="w-3 h-3" />
          Sync to Sheet
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

      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sheet className="w-5 h-5 text-green-600" />
                <h2 className="text-base font-semibold text-gray-900">Sync to Google Sheets</h2>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {!currentCampaignId ? (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                  Please filter the dashboard by a specific campaign first, then click Sync to Sheet.
                </p>
              ) : syncLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-400">Loading campaign data…</div>
              ) : (
                <>
                  {syncCampaign && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                      <Sheet className="w-4 h-4 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{syncCampaign.name}</p>
                        <p className="text-xs text-slate-500">
                          {syncCampaign.totalLeads} lead{syncCampaign.totalLeads !== 1 ? "s" : ""} ready to sync
                          {syncCampaign.googleSheetId && (
                            <> · <a href={syncCampaign.googleSheetId} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">Open Sheet ↗</a></>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 space-y-1">
                    <p className="font-semibold">How it works — no login required</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-green-700">
                      <li>Open your Google Sheet → Extensions → Apps Script</li>
                      <li>Paste the code below and click Save</li>
                      <li>Run <code className="bg-green-100 px-1 rounded font-mono text-xs">syncBenwillData()</code> to sync now</li>
                      <li>Optionally set a time-based trigger to auto-sync on a schedule</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Apps Script Code</span>
                      <button
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 bg-indigo-50 hover:bg-indigo-100 rounded-md px-2.5 py-1 transition-all"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied!" : "Copy Code"}
                      </button>
                    </div>
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto overflow-y-auto max-h-72 leading-relaxed whitespace-pre">
                      {appsScript}
                    </pre>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-700">Column mapping (edit in the script)</p>
                    <p>By default the script reads emails from <strong>column A</strong> and writes status to <strong>B</strong>, sent date to <strong>C</strong>, reply to <strong>D</strong>, Gmail link to <strong>E</strong>, next follow-up to <strong>F</strong>. Change the <code className="bg-slate-100 px-1 rounded">COLUMNS</code> object at the top of the script to match your sheet.</p>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <Button variant="outline" onClick={() => setShowSyncModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
