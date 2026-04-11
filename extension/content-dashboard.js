/**
 * Content script: Leads Dashboard
 * Listens for Send button clicks, extracts row data, starts workflow via background.
 */

(function () {
  "use strict";

  // Table columns: 1=Campaign, 2=Recipient Name, 3=Recipient Email, 4=Website, 5=Niche,
  // 6=Status, 7=Thread ID, 8=Mail Data, 9=Sent Gmail, 10=Sent At, 11=Created At, 12=Actions
  const boundButtons = new WeakSet();
  let delegatedCheckReplyBound = false;
  const AUTOMATION_PANEL_ID = "leads-extension-automation-panel";
  const AUTOMATION_DELAY_MIN_KEY = "leadsExtensionBulkDelayMinMs";
  const AUTOMATION_DELAY_MAX_KEY = "leadsExtensionBulkDelayMaxMs";
  const AUTOMATION_LIMIT_KEY = "leadsExtensionBulkLimit";
  const AUTOMATION_AUTO_FOLLOWUP_KEY = "leadsExtensionBulkAutoFollowup";
  const AUTOMATION_WINDOW_ENABLED_KEY = "leadsExtensionBulkWindowEnabled";
  const AUTOMATION_WINDOW_START_KEY = "leadsExtensionBulkWindowStart";
  const AUTOMATION_WINDOW_END_KEY = "leadsExtensionBulkWindowEnd";
  const AUTOMATION_DOMAIN_THROTTLE_KEY = "leadsExtensionBulkDomainThrottle";
  const AUTOMATION_START_PHASE_KEY = "leadsExtensionBulkStartPhase";
  const DEFAULT_BULK_DELAY_MS = 45000;
  const DEFAULT_BULK_LIMIT = 50;
  const DEFAULT_WINDOW_START = "09:00";
  const DEFAULT_WINDOW_END = "18:00";
  const BRIDGE_REQUEST_TYPE = "LEADS_EXTENSION_BRIDGE_REQUEST";
  const BRIDGE_RESPONSE_TYPE = "LEADS_EXTENSION_BRIDGE_RESPONSE";
  const BRIDGE_READY_TYPE = "LEADS_EXTENSION_BRIDGE_READY";
  let automationPollTimer = null;
  let bridgeListenerBound = false;

  function hasRuntimeMessaging() {
    return (
      typeof chrome !== "undefined" &&
      !!chrome.runtime &&
      !!chrome.runtime.id &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function recoverRuntime(reason) {
    const reloadKey = "leadsExtensionRuntimeRecoveryAt";
    const now = Date.now();
    const lastReload = parseInt(sessionStorage.getItem(reloadKey) || "0", 10);

    if (now - lastReload > 10000) {
      sessionStorage.setItem(reloadKey, String(now));
      console.warn("[Leads Extension Dashboard]", reason, "Reloading dashboard tab to reattach extension runtime.");
      window.location.reload();
      return true;
    }

    logError("Dashboard", new Error(reason));
    return false;
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "Runtime messaging failed"));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
  }

  function normalizeTimeValue(value, fallback) {
    const raw = String(value || "").trim();
    const match = raw.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return fallback;
    return String(match[1]).padStart(2, "0") + ":" + String(match[2]).padStart(2, "0");
  }

  function getStoredBulkDelayMinMs() {
    try {
      const raw = localStorage.getItem(AUTOMATION_DELAY_MIN_KEY);
      return clampNumber(raw, 5000, 600000, DEFAULT_BULK_DELAY_MS);
    } catch (_) {
      return DEFAULT_BULK_DELAY_MS;
    }
  }

  function getStoredBulkDelayMaxMs() {
    try {
      const raw = localStorage.getItem(AUTOMATION_DELAY_MAX_KEY);
      return clampNumber(raw, 5000, 600000, DEFAULT_BULK_DELAY_MS);
    } catch (_) {
      return DEFAULT_BULK_DELAY_MS;
    }
  }

  function setStoredBulkDelayMinMs(value) {
    try {
      localStorage.setItem(AUTOMATION_DELAY_MIN_KEY, String(value));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function setStoredBulkDelayMaxMs(value) {
    try {
      localStorage.setItem(AUTOMATION_DELAY_MAX_KEY, String(value));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getStoredBulkLimit() {
    try {
      const raw = localStorage.getItem(AUTOMATION_LIMIT_KEY);
      return clampNumber(raw, 1, 500, DEFAULT_BULK_LIMIT);
    } catch (_) {
      return DEFAULT_BULK_LIMIT;
    }
  }

  function setStoredBulkLimit(value) {
    try {
      localStorage.setItem(AUTOMATION_LIMIT_KEY, String(value));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getStoredDomainThrottle() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(AUTOMATION_DOMAIN_THROTTLE_KEY, (result) => {
          const n = Number.parseInt(String(result[AUTOMATION_DOMAIN_THROTTLE_KEY] ?? "0"), 10);
          resolve(Number.isNaN(n) ? 0 : Math.max(0, Math.min(n, 100)));
        });
      } catch (_) {
        resolve(0);
      }
    });
  }

  function setStoredDomainThrottle(value) {
    try {
      chrome.storage.local.set({ [AUTOMATION_DOMAIN_THROTTLE_KEY]: String(value) });
    } catch (_) {
      // Ignore storage errors.
    }
  }

  const VALID_START_PHASES = ["send", "both", "followup", "followup1", "followup2"];

  function getStoredStartPhase() {
    try {
      const raw = localStorage.getItem(AUTOMATION_START_PHASE_KEY) || "";
      return VALID_START_PHASES.includes(raw) ? raw : "send";
    } catch (_) {
      return "send";
    }
  }

  function setStoredStartPhase(value) {
    try {
      if (VALID_START_PHASES.includes(value)) {
        localStorage.setItem(AUTOMATION_START_PHASE_KEY, value);
      }
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getStoredAutoFollowupEnabled() {
    try {
      return localStorage.getItem(AUTOMATION_AUTO_FOLLOWUP_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setStoredAutoFollowupEnabled(value) {
    try {
      localStorage.setItem(AUTOMATION_AUTO_FOLLOWUP_KEY, value ? "1" : "0");
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getStoredWindowEnabled() {
    try {
      return localStorage.getItem(AUTOMATION_WINDOW_ENABLED_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setStoredWindowEnabled(value) {
    try {
      localStorage.setItem(AUTOMATION_WINDOW_ENABLED_KEY, value ? "1" : "0");
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getStoredWindowStart() {
    try {
      return normalizeTimeValue(localStorage.getItem(AUTOMATION_WINDOW_START_KEY), DEFAULT_WINDOW_START);
    } catch (_) {
      return DEFAULT_WINDOW_START;
    }
  }

  function getStoredWindowEnd() {
    try {
      return normalizeTimeValue(localStorage.getItem(AUTOMATION_WINDOW_END_KEY), DEFAULT_WINDOW_END);
    } catch (_) {
      return DEFAULT_WINDOW_END;
    }
  }

  function setStoredWindowStart(value) {
    try {
      localStorage.setItem(AUTOMATION_WINDOW_START_KEY, normalizeTimeValue(value, DEFAULT_WINDOW_START));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function setStoredWindowEnd(value) {
    try {
      localStorage.setItem(AUTOMATION_WINDOW_END_KEY, normalizeTimeValue(value, DEFAULT_WINDOW_END));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function getCurrentCampaignFilterId() {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = String(params.get("campaign") || "").trim();
    if (fromQuery) return fromQuery;
    return "";
  }

  function postBridgeResponse(id, success, payload) {
    try {
      window.postMessage(
        {
          type: BRIDGE_RESPONSE_TYPE,
          id: String(id || ""),
          success: !!success,
          payload: payload || null,
        },
        window.location.origin
      );
    } catch (_) {
      // Ignore.
    }
  }

  function initRuntimeBridge() {
    if (bridgeListenerBound) {
      return;
    }
    bridgeListenerBound = true;

    // Save the dashboard origin so background.js can use it for API calls
    try {
      chrome.storage.local.set({ leadsExtensionDashboardOrigin: window.location.origin });
    } catch (_) {}

    window.addEventListener("message", async (event) => {
      if (event.source !== window) {
        return;
      }
      const message = event.data || {};
      if (!message || message.type !== BRIDGE_REQUEST_TYPE) {
        return;
      }

      const id = String(message.id || "").trim();
      if (!id) {
        return;
      }

      const action = message.action ? String(message.action) : "";
      const data = message.data || {};
      if (!action) {
        postBridgeResponse(id, false, { error: "Action is required" });
        return;
      }

      if (!hasRuntimeMessaging()) {
        postBridgeResponse(id, false, { error: "Extension runtime unavailable" });
        return;
      }

      try {
        if (action === "startWorkflow") {
          console.log("[Leads Dashboard Bridge] Forwarding startWorkflow. scheduleSendTime:", data.scheduleSendTime || "(EMPTY)");
        }
        const response = await sendRuntimeMessage({ action, data });
        postBridgeResponse(id, true, response || null);
      } catch (error) {
        postBridgeResponse(id, false, {
          error: error && error.message ? error.message : "Runtime bridge request failed",
        });
      }
    });

    try {
      window.postMessage({ type: BRIDGE_READY_TYPE }, window.location.origin);
    } catch (_) {
      // Ignore.
    }
  }

  function getAutomationPanelNodes() {
    const panel = document.getElementById(AUTOMATION_PANEL_ID);
    if (!panel) return null;
    return {
      panel,
      status: panel.querySelector('[data-role="status"]'),
      progress: panel.querySelector('[data-role="progress"]'),
      error: panel.querySelector('[data-role="error"]'),
      delayMinInput: panel.querySelector('input[name="bulkDelayMinSeconds"]'),
      delayMaxInput: panel.querySelector('input[name="bulkDelayMaxSeconds"]'),
      limitInput: panel.querySelector('input[name="bulkLimit"]'),
      autoFollowupInput: panel.querySelector('input[name="bulkAutoFollowup"]'),
      windowEnabledInput: panel.querySelector('input[name="bulkWindowEnabled"]'),
      windowStartInput: panel.querySelector('input[name="bulkWindowStart"]'),
      windowEndInput: panel.querySelector('input[name="bulkWindowEnd"]'),
      domainThrottleInput: panel.querySelector('input[name="bulkDomainThrottle"]'),
      startBtn: panel.querySelector('button[data-action="bulk-start"]'),
      pauseBtn: panel.querySelector('button[data-action="bulk-pause"]'),
      resumeBtn: panel.querySelector('button[data-action="bulk-resume"]'),
      stopBtn: panel.querySelector('button[data-action="bulk-stop"]'),
      refreshBtn: panel.querySelector('button[data-action="bulk-refresh"]'),
      phaseButtons: panel.querySelectorAll('button[data-phase]'),
    };
  }

  function formatBulkStatus(status) {
    const value = String(status || "idle").toLowerCase();
    if (value === "running") return "Running";
    if (value === "paused") return "Paused";
    if (value === "waiting-window") return "Waiting for window";
    if (value === "stopping") return "Stopping";
    if (value === "completed") return "Completed";
    if (value === "failed") return "Failed";
    if (value === "stopped") return "Stopped";
    return "Idle";
  }

  function renderBulkState(state, errorText) {
    const nodes = getAutomationPanelNodes();
    if (!nodes) return;

    const s = state || {};
    const statusValue = String(s.status || "idle").toLowerCase();
    const total = Number(s.total || 0);
    const processed = Number(s.processed || 0);
    const sent = Number(s.sent || 0);
    const followups = Number(s.followups || 0);
    const failed = Number(s.failed || 0);
    const skipped = Number(s.skipped || 0);
    const remaining = Math.max(total - processed, 0);

    if (nodes.status) {
      const phaseText = s.phase ? String(s.phase) : "send";
      nodes.status.textContent = "Status: " + formatBulkStatus(statusValue) + " • Phase: " + phaseText;
    }
    if (nodes.progress) {
      let text = "Processed " + processed + "/" + total + " • Sent " + sent + " • Follow-ups " + followups + " • Failed " + failed;
      if (skipped > 0) {
        text += " • Skipped " + skipped;
      }
      if (statusValue === "running" || statusValue === "paused" || statusValue === "stopping" || statusValue === "waiting-window") {
        text += " • Remaining " + remaining;
      }
      if (s.currentRecipientEmail) {
        text += " • Current " + String(s.currentRecipientEmail);
      }
      const minSec = Math.max(5, Math.round(Number(s.delayMinMs || getStoredBulkDelayMinMs()) / 1000));
      const maxSec = Math.max(minSec, Math.round(Number(s.delayMaxMs || getStoredBulkDelayMaxMs()) / 1000));
      text += " • Delay " + minSec + "-" + maxSec + "s";
      if (s.windowEnabled) {
        text += " • Window " + String(s.sendWindowStart || DEFAULT_WINDOW_START) + "-" + String(s.sendWindowEnd || DEFAULT_WINDOW_END);
      }
      const activeThrottle = Number(s.domainThrottle || 0);
      if (activeThrottle > 0) {
        text += " • max " + activeThrottle + "/domain";
      }
      nodes.progress.textContent = text;
    }

    if (nodes.error) {
      const message = errorText || (s.lastError ? String(s.lastError) : "");
      nodes.error.textContent = message;
      nodes.error.classList.toggle("hidden", !message);
    }

    if (nodes.delayMinInput && !nodes.delayMinInput.matches(":focus")) {
      const delayMinSeconds = Math.max(5, Math.round(Number(s.delayMinMs || getStoredBulkDelayMinMs()) / 1000));
      nodes.delayMinInput.value = String(delayMinSeconds);
    }

    if (nodes.delayMaxInput && !nodes.delayMaxInput.matches(":focus")) {
      const delayMaxSeconds = Math.max(5, Math.round(Number(s.delayMaxMs || getStoredBulkDelayMaxMs()) / 1000));
      nodes.delayMaxInput.value = String(delayMaxSeconds);
    }

    if (nodes.limitInput && !nodes.limitInput.matches(":focus")) {
      const limit = clampNumber(s.limit, 1, 500, getStoredBulkLimit());
      nodes.limitInput.value = String(limit);
    }

    if (nodes.domainThrottleInput && !nodes.domainThrottleInput.matches(":focus")) {
      const domainThrottleFromState = Number(s.domainThrottle);
      if (!Number.isNaN(domainThrottleFromState) && domainThrottleFromState >= 0) {
        nodes.domainThrottleInput.value = String(domainThrottleFromState);
      } else {
        getStoredDomainThrottle().then((stored) => {
          if (nodes.domainThrottleInput && !nodes.domainThrottleInput.matches(":focus")) {
            nodes.domainThrottleInput.value = String(stored);
          }
        });
      }
    }

    if (nodes.autoFollowupInput) {
      nodes.autoFollowupInput.checked = !!s.followupEnabled;
    }
    if (nodes.windowEnabledInput) {
      nodes.windowEnabledInput.checked = !!s.windowEnabled;
    }
    if (nodes.windowStartInput && !nodes.windowStartInput.matches(":focus")) {
      nodes.windowStartInput.value = normalizeTimeValue(s.sendWindowStart, getStoredWindowStart());
    }
    if (nodes.windowEndInput && !nodes.windowEndInput.matches(":focus")) {
      nodes.windowEndInput.value = normalizeTimeValue(s.sendWindowEnd, getStoredWindowEnd());
    }

    const isActive = statusValue === "running" || statusValue === "paused" || statusValue === "stopping" || statusValue === "waiting-window";
    const canStart = !isActive;
    if (nodes.startBtn) nodes.startBtn.disabled = !canStart;
    if (nodes.pauseBtn) nodes.pauseBtn.disabled = !(statusValue === "running" || statusValue === "waiting-window");
    if (nodes.resumeBtn) nodes.resumeBtn.disabled = statusValue !== "paused";
    if (nodes.stopBtn) nodes.stopBtn.disabled = !isActive || statusValue === "stopping";
  }

  async function refreshBulkState(errorText) {
    if (!hasRuntimeMessaging()) {
      return;
    }
    try {
      const response = await sendRuntimeMessage({ action: "getBulkAutomationState" });
      if (response && response.success) {
        renderBulkState(response.state || {}, errorText || "");
      } else {
        renderBulkState({}, errorText || (response && response.error ? response.error : "Failed to fetch automation state"));
      }
    } catch (error) {
      renderBulkState({}, errorText || (error && error.message ? error.message : "Failed to fetch automation state"));
    }
  }

  function ensureAutomationPolling() {
    if (automationPollTimer) {
      return;
    }
    automationPollTimer = setInterval(() => {
      refreshBulkState();
    }, 1800);
  }

  function readBulkFormValues() {
    const nodes = getAutomationPanelNodes();
    const minDelaySeconds = clampNumber(
      nodes && nodes.delayMinInput ? nodes.delayMinInput.value : "",
      5,
      600,
      Math.round(getStoredBulkDelayMinMs() / 1000)
    );
    const maxDelaySecondsRaw = clampNumber(
      nodes && nodes.delayMaxInput ? nodes.delayMaxInput.value : "",
      5,
      600,
      Math.round(getStoredBulkDelayMaxMs() / 1000)
    );
    const maxDelaySeconds = Math.max(minDelaySeconds, maxDelaySecondsRaw);
    const limit = clampNumber(
      nodes && nodes.limitInput ? nodes.limitInput.value : "",
      1,
      500,
      getStoredBulkLimit()
    );
    const domainThrottle = clampNumber(
      nodes && nodes.domainThrottleInput ? nodes.domainThrottleInput.value : "",
      0,
      100,
      0
    );
    const autoFollowupEnabled = !!(nodes && nodes.autoFollowupInput && nodes.autoFollowupInput.checked);
    const windowEnabled = !!(nodes && nodes.windowEnabledInput && nodes.windowEnabledInput.checked);
    const sendWindowStart = normalizeTimeValue(
      nodes && nodes.windowStartInput ? nodes.windowStartInput.value : "",
      getStoredWindowStart()
    );
    const sendWindowEnd = normalizeTimeValue(
      nodes && nodes.windowEndInput ? nodes.windowEndInput.value : "",
      getStoredWindowEnd()
    );
    // Read the currently selected phase button (data-phase attribute on the active btn).
    // Falls back to the stored phase, then "send" as the default.
    let startPhase = getStoredStartPhase();
    if (nodes && nodes.phaseButtons) {
      nodes.phaseButtons.forEach(function (btn) {
        if (btn.getAttribute("data-active") === "1") {
          const val = btn.getAttribute("data-phase") || "send";
          if (VALID_START_PHASES.includes(val)) startPhase = val;
        }
      });
    }
    const delayMinMs = minDelaySeconds * 1000;
    const delayMaxMs = maxDelaySeconds * 1000;
    return {
      delayMinMs,
      delayMaxMs,
      minDelaySeconds,
      maxDelaySeconds,
      limit,
      domainThrottle,
      autoFollowupEnabled,
      windowEnabled,
      sendWindowStart,
      sendWindowEnd,
      startPhase,
    };
  }

  async function handleBulkAction(action) {
    if (!hasRuntimeMessaging()) {
      recoverRuntime("Extension runtime unavailable");
      return;
    }

    try {
      if (action === "start") {
        const values = readBulkFormValues();
        setStoredBulkDelayMinMs(values.delayMinMs);
        setStoredBulkDelayMaxMs(values.delayMaxMs);
        setStoredBulkLimit(values.limit);
        setStoredDomainThrottle(values.domainThrottle);
        setStoredAutoFollowupEnabled(values.autoFollowupEnabled);
        setStoredWindowEnabled(values.windowEnabled);
        setStoredWindowStart(values.sendWindowStart);
        setStoredWindowEnd(values.sendWindowEnd);
        setStoredStartPhase(values.startPhase);
        const response = await sendRuntimeMessage({
          action: "startBulkAutomation",
          data: {
            campaignId: getCurrentCampaignFilterId(),
            delayMinMs: values.delayMinMs,
            delayMaxMs: values.delayMaxMs,
            limit: values.limit,
            startPhase: values.startPhase,
            domainThrottle: values.domainThrottle,
            followupEnabled: values.autoFollowupEnabled,
            windowEnabled: values.windowEnabled,
            sendWindowStart: values.sendWindowStart,
            sendWindowEnd: values.sendWindowEnd,
          },
        });
        if (!response || !response.success) {
          const message = response && response.error ? response.error : "Failed to start automation";
          await refreshBulkState(message);
          return;
        }
        await refreshBulkState("");
        return;
      }

      if (action === "pause") {
        const response = await sendRuntimeMessage({ action: "pauseBulkAutomation" });
        const message = response && !response.success ? (response.error || "Failed to pause") : "";
        await refreshBulkState(message);
        return;
      }

      if (action === "resume") {
        const response = await sendRuntimeMessage({ action: "resumeBulkAutomation" });
        const message = response && !response.success ? (response.error || "Failed to resume") : "";
        await refreshBulkState(message);
        return;
      }

      if (action === "stop") {
        const response = await sendRuntimeMessage({ action: "stopBulkAutomation" });
        const message = response && !response.success ? (response.error || "Failed to stop") : "";
        await refreshBulkState(message);
        return;
      }

      if (action === "refresh") {
        await refreshBulkState("");
      }
    } catch (error) {
      const message = error && error.message ? error.message : "Automation action failed";
      await refreshBulkState(message);
    }
  }

  function applyActivePhaseBtnStyle(phaseButtons, activePhase) {
    phaseButtons.forEach(function (btn) {
      const phase = btn.getAttribute("data-phase") || "";
      const isActive = phase === activePhase;
      btn.setAttribute("data-active", isActive ? "1" : "0");
      btn.style.background = isActive ? "#4f46e5" : "";
      btn.style.color = isActive ? "#fff" : "";
      btn.style.fontWeight = isActive ? "600" : "";
    });
  }

  function bindAutomationPanelEvents() {
    const nodes = getAutomationPanelNodes();
    if (!nodes) return;
    if (nodes.startBtn && !nodes.startBtn.dataset.bound) {
      nodes.startBtn.dataset.bound = "1";
      nodes.startBtn.addEventListener("click", () => handleBulkAction("start"));
    }
    // Phase selector — bind each phase button to update active state + persist selection.
    if (nodes.phaseButtons && nodes.phaseButtons.length > 0) {
      nodes.phaseButtons.forEach(function (btn) {
        if (btn.dataset.phaseBound) return;
        btn.dataset.phaseBound = "1";
        btn.addEventListener("click", function () {
          const phase = btn.getAttribute("data-phase") || "send";
          setStoredStartPhase(phase);
          applyActivePhaseBtnStyle(nodes.phaseButtons, phase);
        });
      });
    }
    if (nodes.pauseBtn && !nodes.pauseBtn.dataset.bound) {
      nodes.pauseBtn.dataset.bound = "1";
      nodes.pauseBtn.addEventListener("click", () => handleBulkAction("pause"));
    }
    if (nodes.resumeBtn && !nodes.resumeBtn.dataset.bound) {
      nodes.resumeBtn.dataset.bound = "1";
      nodes.resumeBtn.addEventListener("click", () => handleBulkAction("resume"));
    }
    if (nodes.stopBtn && !nodes.stopBtn.dataset.bound) {
      nodes.stopBtn.dataset.bound = "1";
      nodes.stopBtn.addEventListener("click", () => handleBulkAction("stop"));
    }
    if (nodes.refreshBtn && !nodes.refreshBtn.dataset.bound) {
      nodes.refreshBtn.dataset.bound = "1";
      nodes.refreshBtn.addEventListener("click", () => handleBulkAction("refresh"));
    }
    if (nodes.delayMinInput && !nodes.delayMinInput.dataset.bound) {
      nodes.delayMinInput.dataset.bound = "1";
      nodes.delayMinInput.addEventListener("change", () => {
        const minDelaySeconds = clampNumber(nodes.delayMinInput.value, 5, 600, 45);
        nodes.delayMinInput.value = String(minDelaySeconds);
        setStoredBulkDelayMinMs(minDelaySeconds * 1000);
      });
    }
    if (nodes.delayMaxInput && !nodes.delayMaxInput.dataset.bound) {
      nodes.delayMaxInput.dataset.bound = "1";
      nodes.delayMaxInput.addEventListener("change", () => {
        const maxDelaySeconds = clampNumber(nodes.delayMaxInput.value, 5, 600, 45);
        nodes.delayMaxInput.value = String(maxDelaySeconds);
        setStoredBulkDelayMaxMs(maxDelaySeconds * 1000);
      });
    }
    if (nodes.limitInput && !nodes.limitInput.dataset.bound) {
      nodes.limitInput.dataset.bound = "1";
      nodes.limitInput.addEventListener("change", () => {
        const limit = clampNumber(nodes.limitInput.value, 1, 500, 50);
        nodes.limitInput.value = String(limit);
        setStoredBulkLimit(limit);
      });
    }
    if (nodes.domainThrottleInput && !nodes.domainThrottleInput.dataset.bound) {
      nodes.domainThrottleInput.dataset.bound = "1";
      nodes.domainThrottleInput.addEventListener("change", () => {
        const throttle = clampNumber(nodes.domainThrottleInput.value, 0, 100, 0);
        nodes.domainThrottleInput.value = String(throttle);
        setStoredDomainThrottle(throttle);
      });
    }
    if (nodes.autoFollowupInput && !nodes.autoFollowupInput.dataset.bound) {
      nodes.autoFollowupInput.dataset.bound = "1";
      nodes.autoFollowupInput.addEventListener("change", () => {
        setStoredAutoFollowupEnabled(!!nodes.autoFollowupInput.checked);
      });
    }
    if (nodes.windowEnabledInput && !nodes.windowEnabledInput.dataset.bound) {
      nodes.windowEnabledInput.dataset.bound = "1";
      nodes.windowEnabledInput.addEventListener("change", () => {
        setStoredWindowEnabled(!!nodes.windowEnabledInput.checked);
      });
    }
    if (nodes.windowStartInput && !nodes.windowStartInput.dataset.bound) {
      nodes.windowStartInput.dataset.bound = "1";
      nodes.windowStartInput.addEventListener("change", () => {
        const value = normalizeTimeValue(nodes.windowStartInput.value, DEFAULT_WINDOW_START);
        nodes.windowStartInput.value = value;
        setStoredWindowStart(value);
      });
    }
    if (nodes.windowEndInput && !nodes.windowEndInput.dataset.bound) {
      nodes.windowEndInput.dataset.bound = "1";
      nodes.windowEndInput.addEventListener("change", () => {
        const value = normalizeTimeValue(nodes.windowEndInput.value, DEFAULT_WINDOW_END);
        nodes.windowEndInput.value = value;
        setStoredWindowEnd(value);
      });
    }
  }

  function ensureAutomationPanel() {
    // Native React panel now renders in app/dashboard/page.tsx.
    // Do not inject DOM here, otherwise hydration can mismatch.
    return;

    const existing = document.getElementById(AUTOMATION_PANEL_ID);
    if (existing) {
      bindAutomationPanelEvents();
      ensureAutomationPolling();
      return;
    }

    const table = document.querySelector("table");
    if (!table || !table.parentElement) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = AUTOMATION_PANEL_ID;
    panel.className = "mx-3 mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs";
    panel.innerHTML =
      '<div class="flex flex-wrap items-center gap-2">' +
      '<span class="font-semibold text-blue-900">Bulk Automation</span>' +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">Delay Min (sec)</span>' +
      '<input name="bulkDelayMinSeconds" type="number" min="5" max="600" class="h-8 w-20 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">Delay Max (sec)</span>' +
      '<input name="bulkDelayMaxSeconds" type="number" min="5" max="600" class="h-8 w-20 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">Limit</span>' +
      '<input name="bulkLimit" type="number" min="1" max="500" class="h-8 w-20 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">Max/domain</span>' +
      '<input name="bulkDomainThrottle" type="number" min="0" max="100" placeholder="0=off" class="h-8 w-20 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<label class="inline-flex items-center gap-1 rounded border bg-white px-2 py-1">' +
      '<input name="bulkAutoFollowup" type="checkbox" />' +
      '<span class="text-slate-700">Auto follow-ups</span>' +
      "</label>" +
      '<label class="inline-flex items-center gap-1 rounded border bg-white px-2 py-1">' +
      '<input name="bulkWindowEnabled" type="checkbox" />' +
      '<span class="text-slate-700">Send window</span>' +
      "</label>" +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">From</span>' +
      '<input name="bulkWindowStart" type="time" class="h-8 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<label class="inline-flex items-center gap-1">' +
      '<span class="text-slate-700">To</span>' +
      '<input name="bulkWindowEnd" type="time" class="h-8 rounded border bg-white px-2 text-xs" />' +
      "</label>" +
      '<button type="button" data-action="bulk-start" class="h-8 rounded border px-3 font-medium text-slate-800 hover:bg-white">▶ Start</button>' +
      '<button type="button" data-action="bulk-pause" class="h-8 rounded border px-3 text-slate-700 hover:bg-white">Pause</button>' +
      '<button type="button" data-action="bulk-resume" class="h-8 rounded border px-3 text-slate-700 hover:bg-white">Resume</button>' +
      '<button type="button" data-action="bulk-stop" class="h-8 rounded border px-3 text-slate-700 hover:bg-white">Stop</button>' +
      '<button type="button" data-action="bulk-refresh" class="h-8 rounded border px-2 text-slate-700 hover:bg-white">↻</button>' +
      "</div>" +
      '<div class="mt-1 flex flex-wrap items-center gap-1">' +
      '<span class="text-slate-600 font-medium">Phase:</span>' +
      '<button type="button" data-phase="send" class="h-7 rounded border px-2 text-xs text-slate-700 hover:bg-white">New only</button>' +
      '<button type="button" data-phase="both" class="h-7 rounded border px-2 text-xs text-slate-700 hover:bg-white">New + Follow-ups</button>' +
      '<button type="button" data-phase="followup" class="h-7 rounded border px-2 text-xs text-slate-700 hover:bg-white">All Follow-ups</button>' +
      '<button type="button" data-phase="followup1" class="h-7 rounded border px-2 text-xs text-slate-700 hover:bg-white">Follow-up 1</button>' +
      '<button type="button" data-phase="followup2" class="h-7 rounded border px-2 text-xs text-slate-700 hover:bg-white">Follow-up 2</button>' +
      "</div>" +
      '<div class="mt-2 text-slate-700" data-role="status">Status: Idle</div>' +
      '<div class="text-slate-600" data-role="progress">Processed 0/0 • Sent 0 • Failed 0</div>' +
      '<div class="hidden text-red-600" data-role="error"></div>';

    table.parentElement.insertBefore(panel, table);

    const nodes = getAutomationPanelNodes();
    if (nodes && nodes.delayMinInput) {
      nodes.delayMinInput.value = String(Math.round(getStoredBulkDelayMinMs() / 1000));
    }
    if (nodes && nodes.delayMaxInput) {
      nodes.delayMaxInput.value = String(Math.round(getStoredBulkDelayMaxMs() / 1000));
    }
    if (nodes && nodes.limitInput) {
      nodes.limitInput.value = String(getStoredBulkLimit());
    }
    if (nodes && nodes.domainThrottleInput) {
      getStoredDomainThrottle().then((stored) => {
        if (nodes && nodes.domainThrottleInput) {
          nodes.domainThrottleInput.value = String(stored);
        }
      });
    }
    if (nodes && nodes.autoFollowupInput) {
      nodes.autoFollowupInput.checked = getStoredAutoFollowupEnabled();
    }
    if (nodes && nodes.windowEnabledInput) {
      nodes.windowEnabledInput.checked = getStoredWindowEnabled();
    }
    if (nodes && nodes.windowStartInput) {
      nodes.windowStartInput.value = getStoredWindowStart();
    }
    if (nodes && nodes.windowEndInput) {
      nodes.windowEndInput.value = getStoredWindowEnd();
    }
    // Restore selected phase button from storage.
    if (nodes && nodes.phaseButtons && nodes.phaseButtons.length > 0) {
      applyActivePhaseBtnStyle(nodes.phaseButtons, getStoredStartPhase());
    }

    bindAutomationPanelEvents();
    ensureAutomationPolling();
    refreshBulkState();
  }

  function getCellText(row, selector) {
    try {
      const el = row.querySelector(selector);
      return el ? (el.textContent || "").trim() : "";
    } catch {
      return "";
    }
  }

  function findSendButton(row) {
    return row.querySelector('button[data-action="send"]:not([disabled])');
  }

  function getStepFromRow(row) {
    const stepCell = row.querySelector("td:nth-child(7)");
    if (stepCell) {
      const dataStep = stepCell.getAttribute("data-step");
      if (dataStep) {
        const n = parseInt(dataStep, 10);
        if (!isNaN(n)) return n;
      }
    }
    const stepText = getCellText(row, "td:nth-child(7)");
    const labels = { "Follow up 1": 2, "Follow up 2": 3, "Sent": 1, "Replied": 1, "Pending": 1 };
    return labels[stepText] ?? 1;
  }

  function extractRowData(row) {
    const campaignEl = row.querySelector("td:nth-child(2) a");
    const campaignName = campaignEl ? (campaignEl.textContent || "").trim() : getCellText(row, "td:nth-child(2)");
    const campaignId = (row.getAttribute("data-campaign-id") || "").trim();
    const campaignChatId = (row.getAttribute("data-campaign-chat-id") || "").trim();
    const campaignGmailAuthUser = (row.getAttribute("data-campaign-gmail-auth-user") || "").trim();
    const campaignGmailAccountIndex = (row.getAttribute("data-campaign-gmail-account-index") || "").trim();
    const sentGmailAuthUser = (row.getAttribute("data-sent-gmail-auth-user") || "").trim();
    const recipientName = getCellText(row, "td:nth-child(3)");
    const recipientEmail = getCellText(row, "td:nth-child(4)");
    const websiteUrl = getCellText(row, "td:nth-child(5)");
    const niche = getCellText(row, "td:nth-child(6)");
    const step = getStepFromRow(row);
    const campaignBody = (row.getAttribute("data-campaign-body") || "").trim();
    const campaignSubject = (row.getAttribute("data-campaign-subject") || "").trim();
    const followup1 = (row.getAttribute("data-followup1") || "").trim();
    const followup2 = (row.getAttribute("data-followup2") || "").trim();
    const campaignSignature = (row.getAttribute("data-campaign-signature") || "").trim();
    const gmailThreadId = (row.getAttribute("data-gmail-thread-id") || "").trim();
    const leadId = (row.getAttribute("data-lead-id") || "").trim();
    return {
      leadId,
      campaignId,
      campaignChatId,
      campaignGmailAuthUser,
      campaignGmailAccountIndex,
      sentGmailAuthUser,
      gmailThreadId,
      campaignName,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl === "—" ? "" : websiteUrl,
      niche: niche === "—" ? "" : niche,
      website: websiteUrl === "—" ? "" : websiteUrl,
      step,
      campaignBody,
      campaignSubject,
      campaignSignature,
      followup1,
      followup2,
    };
  }

  function findFollowupButton(row) {
    return row.querySelector('button[data-action="followup"]:not([disabled])');
  }

  function findCheckReplyButton(row) {
    return row.querySelector('button[data-action="check-reply"]:not([disabled])');
  }

  async function handleCheckReplyClick(checkReplyBtn, row, event) {
    if (!checkReplyBtn) {
      return;
    }
    const data = row ? extractRowData(row) : {};
    const leadId = (data.leadId || checkReplyBtn.getAttribute("data-lead-id") || "").trim();
    const threadId = (data.gmailThreadId || checkReplyBtn.getAttribute("data-thread-id") || "").trim();
    const recipientEmail = (data.recipientEmail || checkReplyBtn.getAttribute("data-recipient-email") || "").trim();

    if (!leadId || !threadId || !recipientEmail) {
      console.warn("[Leads Extension] Missing lead/thread/recipient for reply check");
      return;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    if (!hasRuntimeMessaging()) {
      recoverRuntime("Extension runtime unavailable");
      return;
    }

    const prevDisabled = checkReplyBtn.disabled;
    checkReplyBtn.disabled = true;
    checkReplyBtn.setAttribute("aria-label", "Checking reply...");
    checkReplyBtn.setAttribute("title", "Checking reply...");
    checkReplyBtn.classList.add("opacity-60");

    try {
      const response = await chrome.runtime.sendMessage({
        action: "checkReplyByThread",
        data: {
          leadId: leadId,
          threadId: threadId,
          recipientEmail: recipientEmail,
          campaignGmailAuthUser: data.sentGmailAuthUser || data.campaignGmailAuthUser || "",
        },
      });

      if (response && response.success && response.replied) {
        checkReplyBtn.setAttribute("aria-label", "Replied");
        checkReplyBtn.setAttribute("title", "Replied");
        checkReplyBtn.disabled = true;
        checkReplyBtn.classList.remove("opacity-60");
        return;
      }
    } catch (err) {
      logError("Dashboard", err);
    }

    checkReplyBtn.disabled = prevDisabled;
    checkReplyBtn.setAttribute("aria-label", "No reply found yet");
    checkReplyBtn.setAttribute("title", "No reply found yet");
    checkReplyBtn.classList.remove("opacity-60");
  }

  function getStepLabelFromLead(lead) {
    if (!lead) return "Sent";
    if (lead.replied || lead.status === "replied") return "Replied";
    if (lead.status === "pending") return "Pending";
    if (lead.step === 2) return "Follow up 1";
    if (lead.step === 3) return "Follow up 2";
    return "Sent";
  }

  function updateRowFromLead(lead) {
    if (!lead || !lead.id) {
      return;
    }

    const row = document.querySelector('tr[data-lead-id="' + lead.id + '"]');
    if (!row) {
      return;
    }

    const statusCell = row.querySelector("td:nth-child(7)");
    const threadCell = row.querySelector("td:nth-child(8)");
    const mailDataCell = row.querySelector("td:nth-child(9)");
    const sentGmailCell = row.querySelector("td:nth-child(10)");
    const sentAtCell = row.querySelector("td:nth-child(11)");
    const sendBtn = row.querySelector('button[data-action="send"]');
    const followupBtn = row.querySelector('button[data-action="followup"]');
    const checkReplyBtn = row.querySelector('button[data-action="check-reply"]');

    if (statusCell) {
      statusCell.setAttribute("data-step", String(lead.step || 1));
      const badge = statusCell.querySelector("[class]");
      if (badge) {
        badge.textContent = getStepLabelFromLead(lead);
      } else {
        statusCell.textContent = getStepLabelFromLead(lead);
      }
    }

    if (threadCell) {
      const threadId = lead.gmailThreadId || "";
      threadCell.textContent = threadId ? threadId.substring(0, 12) + "..." : "-";
      threadCell.setAttribute("title", threadId);
    }

    if (mailDataCell) {
      const subject = lead.sentSubject || "";
      const body = lead.sentBody || "";
      const hasPreviewButton = !!mailDataCell.querySelector('button[aria-label="Preview sent message"]');

      if (hasPreviewButton) {
        mailDataCell.setAttribute("title", subject);
      } else if (!body) {
        mailDataCell.textContent = "-";
        mailDataCell.removeAttribute("title");
      } else {
        // React preview button cannot be mounted from this content script patch.
        // Reload once so React renders the eye button in this row.
        const refreshKey = "leadsPreviewRefreshAt";
        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(refreshKey) || "0", 10);
        if (now - last > 8000) {
          sessionStorage.setItem(refreshKey, String(now));
          window.location.reload();
          return;
        }
      }
    }

    if (sentAtCell) {
      const sentAt = lead.sentAt ? new Date(lead.sentAt) : null;
      sentAtCell.textContent = sentAt && !Number.isNaN(sentAt.getTime())
        ? sentAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })
        : "-";
      sentAtCell.classList.add("whitespace-nowrap");
    }

    if (sentGmailCell) {
      sentGmailCell.textContent = lead.sentGmailAuthUser || "-";
    }

    if (lead.replied || lead.status === "replied") {
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.setAttribute("title", "Already replied");
      }
      if (followupBtn) {
        followupBtn.disabled = true;
        followupBtn.setAttribute("title", "Already replied");
      }
      if (checkReplyBtn) {
        checkReplyBtn.disabled = true;
        checkReplyBtn.setAttribute("title", "Replied");
      }
    }
  }

  function attachListeners() {
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      const sendBtn = findSendButton(row);
      if (sendBtn && !boundButtons.has(sendBtn)) {
        boundButtons.add(sendBtn);
        sendBtn.addEventListener(
          "click",
          async (e) => {
            const recipientEmail = getCellText(row, "td:nth-child(4)");
            if (!recipientEmail) {
              console.warn("[Leads Extension] No recipient email in row");
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const data = extractRowData(row);
            log("Dashboard", "Send clicked, data:", data);
            if (!hasRuntimeMessaging()) {
              recoverRuntime("Extension runtime unavailable");
              return;
            }
            try {
              chrome.runtime.sendMessage({
                action: "startWorkflow",
                data,
              });
            } catch (err) {
              logError("Dashboard", err);
            }
          },
          true
        );
      }

      const followupBtn = findFollowupButton(row);
      if (followupBtn && !boundButtons.has(followupBtn)) {
        boundButtons.add(followupBtn);
        followupBtn.addEventListener(
          "click",
          async (e) => {
            const data = extractRowData(row);
            const recipientEmail = data.recipientEmail;
            if (!recipientEmail || !data.leadId) {
              console.warn("[Leads Extension] No recipient email or lead id in row");
              return;
            }
            const body = data.step === 1 ? data.followup1 : data.followup2;
            if (!body) {
              console.warn("[Leads Extension] No follow-up content for this step");
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!hasRuntimeMessaging()) {
              recoverRuntime("Extension runtime unavailable");
              return;
            }
            try {
              chrome.runtime.sendMessage({
                action: "startFollowupWorkflow",
                data: {
                  leadId: data.leadId,
                  to: recipientEmail,
                  subject: "Re: " + (data.campaignSubject || ""),
                  body: body,
                  threadId: data.gmailThreadId || null,
                  campaignGmailAuthUser: data.sentGmailAuthUser || data.campaignGmailAuthUser || "",
                },
              });
            } catch (err) {
              logError("Dashboard", err);
            }
          },
          true
        );
      }

      const checkReplyBtn = findCheckReplyButton(row);
      if (checkReplyBtn && !boundButtons.has(checkReplyBtn)) {
        boundButtons.add(checkReplyBtn);
        checkReplyBtn.addEventListener(
          "click",
          async (e) => {
            await handleCheckReplyClick(checkReplyBtn, row, e);
          },
          true
        );
      }
    });
  }

  function init() {
    initRuntimeBridge();
    if (!hasRuntimeMessaging()) {
      recoverRuntime("Extension runtime unavailable during init");
      return;
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "leadUpdated") {
        updateRowFromLead(message.lead);
      }
    });

    if (!delegatedCheckReplyBound) {
      delegatedCheckReplyBound = true;
      document.addEventListener(
        "click",
        async (e) => {
          const target = e.target;
          if (!target || typeof target.closest !== "function") {
            return;
          }
          const btn = target.closest('button[data-action="check-reply"]');
          if (!btn || btn.disabled) {
            return;
          }
          const row = btn.closest("tr");
          await handleCheckReplyClick(btn, row, e);
        },
        true
      );
    }

    log("Dashboard", "Content script loaded");
    attachListeners();
    ensureAutomationPanel();
    setTimeout(attachListeners, 500);
    setTimeout(attachListeners, 1500);
    setTimeout(ensureAutomationPanel, 500);
    setTimeout(ensureAutomationPanel, 1500);
    const observer = new MutationObserver(() => {
      attachListeners();
      ensureAutomationPanel();
    });
    const table = document.querySelector("table tbody");
    if (table) observer.observe(table, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

