"use strict";

const STATUS_LABELS = {
  idle:             "Idle",
  running:          "Running",
  paused:           "Paused",
  completed:        "Completed",
  stopped:          "Stopped",
  failed:           "Failed",
  "waiting-window": "Waiting for send window",
};

function statusClass(status) {
  if (status === "running")   return "status-running";
  if (status === "paused")    return "status-paused";
  if (status === "completed") return "status-completed";
  if (status === "stopped" || status === "failed") return "status-stopped";
  return "status-idle";
}

function render(state) {
  const {
    status         = "idle",
    sent           = 0,
    failed         = 0,
    processed      = 0,
    total          = 0,
    followups      = 0,
    queueRemaining = 0,
    repliedCount   = null,
    todaySentCount = null,
    phase          = "send",
    dashboardUrl   = "",
  } = state;

  const pct        = total > 0 ? Math.round((processed / total) * 100) : 0;
  const label      = STATUS_LABELS[status] || status;
  const cls        = statusClass(status);
  const phaseLabel = phase === "followup" ? "Follow-ups" : "Sending";

  const sentDisplay    = todaySentCount !== null ? todaySentCount : sent;
  const sentLabel      = todaySentCount !== null ? "Sent today"  : "Session sent";
  const repliedDisplay = repliedCount !== null ? repliedCount : followups;
  const repliedLabel   = repliedCount !== null ? "Replied"    : "Follow-ups";

  document.getElementById("content").innerHTML = `
    <div class="status-pill ${cls}">
      <span class="dot"></span>
      ${escHtml(label)}${status === "running" ? " — " + escHtml(phaseLabel) : ""}
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value sent-val">${sentDisplay}</div>
        <div class="stat-label">${sentLabel}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value total-val">${repliedDisplay}</div>
        <div class="stat-label">${repliedLabel}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value queue-val">${queueRemaining}</div>
        <div class="stat-label">In queue</div>
      </div>
    </div>

    ${total > 0 ? `
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progress${failed > 0 ? " · " + failed + " failed" : ""}</span>
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
