"use strict";

const STATUS_LABELS = {
  idle:      "Idle",
  running:   "Running",
  paused:    "Paused",
  completed: "Completed",
  stopped:   "Stopped",
  failed:    "Failed",
  "waiting-window": "Waiting window",
};

function statusClass(status) {
  if (status === "running") return "status-running";
  if (status === "paused")  return "status-paused";
  if (status === "completed") return "status-completed";
  if (status === "stopped" || status === "failed") return "status-stopped";
  return "status-idle";
}

function render(state) {
  const {
    status = "idle",
    sent = 0, failed = 0, processed = 0, total = 0, followups = 0,
    phase = "send", dashboardUrl = "",
  } = state;

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const label = STATUS_LABELS[status] || status;
  const cls   = statusClass(status);
  const phaseLabel = phase === "followup" ? "Follow-ups" : "Sending";

  document.getElementById("content").innerHTML = `
    <div class="status-pill ${cls}">
      <span class="dot"></span>
      ${escHtml(label)}${status === "running" ? " — " + escHtml(phaseLabel) : ""}
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value sent-val">${sent}</div>
        <div class="stat-label">Sent</div>
      </div>
      <div class="stat-card">
        <div class="stat-value total-val">${followups}</div>
        <div class="stat-label">Follow-ups</div>
      </div>
      <div class="stat-card">
        <div class="stat-value failed-val">${failed}</div>
        <div class="stat-label">Failed</div>
      </div>
    </div>

    ${total > 0 ? `
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progress</span>
        <span>${processed} / ${total} (${pct}%)</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
    ` : ""}

    <hr class="divider" />

    <div class="footer">
      ${dashboardUrl ? `
        <a class="btn btn-primary" href="${escHtml(dashboardUrl)}" target="_blank">
          Open Dashboard
        </a>
      ` : ""}
      <button class="btn btn-ghost" id="refresh-btn">Refresh</button>
    </div>
  `;

  document.getElementById("refresh-btn")?.addEventListener("click", load);
}

function renderError(msg) {
  document.getElementById("content").innerHTML =
    `<div class="error-state">${escHtml(msg || "Could not load state.")}</div>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function load() {
  chrome.runtime.sendMessage({ action: "getPopupState" }, (response) => {
    if (chrome.runtime.lastError) {
      renderError("Extension not responding. Try reloading it.");
      return;
    }
    if (!response || !response.success) {
      renderError(response?.error || "Failed to get state.");
      return;
    }
    render(response);
  });
}

document.addEventListener("DOMContentLoaded", load);
