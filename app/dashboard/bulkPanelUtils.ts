"use client";

export type BulkState = {
  status?: string;
  phase?: string;
  startPhase?: string;
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

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTime(value: string, fallback: string): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${String(match[1]).padStart(2, "0")}:${String(match[2]).padStart(2, "0")}`;
}

export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateString(d);
}

export function readStorageInt(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const n = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

export function formatStatus(value: string | undefined): string {
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

export function buildProgressText(state: BulkState, isActive: boolean): string {
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
}
