/**
 * Service worker: orchestrates workflow between dashboard, ChatGPT, and Gmail.
 */

const HUMAN_TONE_INSTRUCTION =
  "\n\nStyle: Write like a real person, not AI. Use short, clear sentences. Do not use em-dashes (—); use commas or full stops instead. Keep the tone conversational and natural. Avoid stiff or overly formal phrasing. Avoid generic flattery, avoid sounding salesy, and avoid lines that feel copied from a template.";

const EMAIL_STRUCTURE_INSTRUCTION =
  "\n\nStructure the email exactly like a human would:\n" +
  "- Start with a short greeting using the recipient's real first name.\n" +
  "- Skip filler like \"I hope you are doing well\" unless there is a specific reason.\n" +
  "- One or two short intro paragraphs: who you are and the concrete reason you're reaching out.\n" +
  "- Mention one specific fit point tied to the recipient's site, niche, or audience. If you do not know one, keep it neutral instead of inventing details.\n" +
  "- A clear transition line before the list, e.g. \"A few angles that may fit your audience:\".\n" +
  "- A bullet list (3 items), each one line and specific. Use a single dash or bullet character (- or •) at the start of each list item.\n" +
  "- A short closing line offering next steps, e.g. \"If any of these are a fit, I can send over an outline.\"\n" +
  "- Then a simple thank-you line.\n" +
  "- End with \"Best regards,\" only. DO NOT add any name, title, company, or signature line after it.\n" +
  "- DO NOT add any sender name or signature line anywhere in the email body.\n" +
  "- Do not use placeholders such as [Your Name], {{topic}}, [Company Name], or bracketed template text anywhere in the final email.";

const ANTI_AI_PHRASES_INSTRUCTION =
  "\n\nAvoid these phrases unless the user explicitly wrote them in the campaign template:\n" +
  "- I hope you are doing well\n" +
  "- I have been reading through your site\n" +
  "- It is clear you focus on real value\n" +
  "- I would love to collaborate\n" +
  "- genuinely helps your audience\n" +
  "- well researched guest article";

// Run ChatGPT and Gmail tabs as active (foreground) tabs to prevent Chrome
// from throttling timers and load events in background tabs, which causes stalls.
const RUN_TABS_IN_BACKGROUND = false;
const REPLY_CHECK_ALARM = "dailyReplyCheck";
const REPLY_CHECK_PERIOD_MINUTES = 2 * 60;
const CHATGPT_HANDOFF_TIMEOUT_MS = 90000;
const CHATGPT_DEFAULT_URL = "https://chatgpt.com/";
const CAMPAIGN_CHAT_URLS_KEY = "campaignChatUrls";
// ── Auto-detect API URL based on where the dashboard is running ──
// Content-dashboard.js stores the dashboard origin via setDashboardOrigin message.
const FALLBACK_API_BASE_URL = "https://automation.benwil.store";
const DASHBOARD_ORIGIN_KEY = "leadsExtensionDashboardOrigin";

async function getApiBaseUrl() {
  try {
    const stored = await chrome.storage.local.get({ [DASHBOARD_ORIGIN_KEY]: "" });
    const origin = String(stored[DASHBOARD_ORIGIN_KEY] || "").trim();
    if (origin && /^https?:\/\/.+/.test(origin)) {
      return origin;
    }
  } catch (_) {}
  return FALLBACK_API_BASE_URL;
}
const BULK_WORKFLOW_TIMEOUT_MS = 240000;
const BULK_DELAY_DEFAULT_MS = 45000;
const BULK_DELAY_MIN_MS = 5000;
const BULK_DELAY_MAX_MS = 600000;
const BULK_LIMIT_DEFAULT = 50;
const BULK_LIMIT_MAX = 500;
let replySweepRunning = false;
let replySweepStopped = false;
let replySweepDisabled = false;
const pendingWorkflows = new Map();
const bulkWorkflowWaiters = new Map();
const bulkAutomationState = createBulkAutomationState();

chrome.runtime.onInstalled.addListener(() => {
  ensureReplyCheckAlarm().catch((err) => {
    console.error("[Leads Extension Background] Failed to setup reply-check alarm:", err);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureReplyCheckAlarm().catch((err) => {
    console.error("[Leads Extension Background] Failed to re-setup reply-check alarm:", err);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || alarm.name !== REPLY_CHECK_ALARM) {
    return;
  }
  if (replySweepDisabled) {
    console.log("[Leads Extension Background] Auto reply check is disabled — skipping alarm.");
    return;
  }
  runDailyReplySweep("alarm").catch((err) => {
    console.error("[Leads Extension Background] Daily reply sweep failed:", err);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startWorkflow") {
    console.log("[Leads Extension] RAW startWorkflow data keys:", message.data ? Object.keys(message.data).join(",") : "(no data)", "scheduleSendTime:", message.data && message.data.scheduleSendTime ? message.data.scheduleSendTime : "(MISSING)");
    handleStartWorkflow(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "chatgptDone") {
    handleChatGptDone(message.data, sender.tab?.id)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "updateLeadStatus") {
    handleUpdateLeadStatus(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "startFollowupWorkflow") {
    handleStartFollowupWorkflow(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "updateFollowup") {
    handleUpdateFollowup(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "checkReplyByThread") {
    handleCheckReplyByThread(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "markLeadReplied") {
    handleMarkLeadReplied(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "closeCurrentTab") {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => { });
    }
    sendResponse({ success: true });
    return true;
  }
  if (message.action === "setCustomSignature") {
    handleSetCustomSignature(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "getCustomSignature") {
    handleGetCustomSignature()
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "setCampaignChatUrl") {
    handleSetCampaignChatUrl(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "getCampaignChatUrl") {
    handleGetCampaignChatUrl(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "startBulkAutomation") {
    handleStartBulkAutomation(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "pauseBulkAutomation") {
    handlePauseBulkAutomation()
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "resumeBulkAutomation") {
    handleResumeBulkAutomation()
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "stopBulkAutomation") {
    handleStopBulkAutomation()
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "validateFollowup") {
    handleValidateFollowup(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "getBulkAutomationState") {
    handleGetBulkAutomationState()
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "triggerReplySweep") {
    runDailyReplySweep("manual")
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "stopReplySweep") {
    replySweepStopped = true;
    sendResponse({ success: true, wasRunning: replySweepRunning });
    return false;
  }
  if (message.action === "setReplySweepEnabled") {
    const enable = message.enabled !== false;
    replySweepDisabled = !enable;
    if (enable) {
      ensureReplyCheckAlarm().catch(() => {});
    } else {
      chrome.alarms.clear(REPLY_CHECK_ALARM).catch(() => {});
    }
    sendResponse({ success: true, disabled: replySweepDisabled });
    return false;
  }
  if (message.action === "getReplySweepState") {
    sendResponse({
      success: true,
      running: replySweepRunning,
      disabled: replySweepDisabled,
    });
    return false;
  }
  if (message.action === "chatgptLoadError") {
    handleChatGptLoadError(message.data, sender.tab?.id)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }
  if (message.action === "sendScheduleError") {
    handleSendScheduleError(message.data)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Leads Extension Background]", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }

  if (message.action === "getPopupState") {
    handleGetPopupState()
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  }

  if (message.action === "scrapeWebsite") {
    scrapeWebsiteContent(message.url)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: String(err.message) }));
    return true;
  }
});

async function handleStartWorkflow(data) {
  // Scrape the lead's website before building the prompt so the context can
  // be injected for personalisation. Skipped gracefully if URL is empty/fails.
  const leadWebsiteUrl = (data.websiteUrl || data.website || "").trim();
  if (leadWebsiteUrl) {
    try {
      const scraped = await scrapeWebsiteContent(leadWebsiteUrl);
      if (scraped) data.websiteContext = scraped;
    } catch (_) { /* non-fatal */ }
  }
  const prompt = buildPrompt(data);
  const campaignId = data && data.campaignId ? String(data.campaignId).trim() : "";
  const campaignChatRaw = data && data.campaignChatId ? String(data.campaignChatId) : "";
  const campaignChatUrl = resolveCampaignChatUrl(campaignChatRaw);

  let mappedChatUrl = campaignChatUrl || "";
  if (!mappedChatUrl) {
    mappedChatUrl = await getCampaignChatUrl(campaignId);
  }
  if (!mappedChatUrl) {
    const recentChatUrl = await findMostRecentOpenChatUrl();
    if (recentChatUrl) {
      mappedChatUrl = recentChatUrl;
      if (campaignId) {
        const save = await setCampaignChatUrl(campaignId, recentChatUrl);
        if (save && save.success) {
          console.log("[Leads Extension] Initial campaign mapping set from recent chat tab:", campaignId, recentChatUrl);
        }
      }
    }
  }
  const chatUrlToOpen = mappedChatUrl || CHATGPT_DEFAULT_URL;
  const tab = await chrome.tabs.create({ url: chatUrlToOpen, active: !RUN_TABS_IN_BACKGROUND });
  if (campaignId && campaignChatUrl && mappedChatUrl) {
    const save = await setCampaignChatUrl(campaignId, mappedChatUrl);
    if (save && save.success) {
      console.log("[Leads Extension] Campaign mapped from configured chat target:", campaignId, mappedChatUrl);
    }
  }
  if (mappedChatUrl) {
    console.log("[Leads Extension] Using mapped ChatGPT URL for campaign:", campaignId, mappedChatUrl);
  }
  console.log("[Leads Extension] Workflow started for lead:", data && data.leadId ? data.leadId : "(no lead id)", "scheduleSendTime:", data && data.scheduleSendTime ? data.scheduleSendTime : "(NONE)");
  // Persist scheduleSendTime to chrome.storage.local so Gmail content script can read it as fallback
  const scheduleTimeForStorage = data && data.scheduleSendTime ? String(data.scheduleSendTime).trim() : "";
  try {
    await chrome.storage.local.set({ pendingScheduleSendTime: scheduleTimeForStorage });
    console.log("[Leads Extension] Stored pendingScheduleSendTime:", scheduleTimeForStorage || "(empty)");
  } catch (e) {
    console.warn("[Leads Extension] Failed to store pendingScheduleSendTime:", e);
  }
  const workflowKey = getWorkflowKey(data);
  pendingWorkflows.set(workflowKey, {
    data: data,
    chatTabId: tab.id,
    startedAt: Date.now(),
    completed: false,
  });
  setTimeout(() => {
    const pending = pendingWorkflows.get(workflowKey);
    if (!pending || pending.completed) {
      return;
    }
    pending.completed = true;
    pendingWorkflows.set(workflowKey, pending);
    openGmailFromFallback(pending.data, pending.chatTabId).catch((err) => {
      console.error("[Leads Extension] Fallback Gmail open failed:", err);
    });
  }, CHATGPT_HANDOFF_TIMEOUT_MS);
  await waitForTabReady(tab.id);
  await delay(2500);
  const sent = await sendMessageToTabWithRetry(tab.id, {
    action: "pasteAndSend",
    prompt,
    recipientName: data.recipientName,
    recipientEmail: data.recipientEmail,
    leadId: data.leadId,
    campaignId: campaignId,
    campaignBody: data.campaignBody || "",
    campaignSignature: data.campaignSignature || "",
    websiteUrl: (data.websiteUrl || data.website || "").trim(),
  }, 5, 700);
  if (!sent) {
    console.error("[Leads Extension] Send message to ChatGPT tab failed after retries (tab:", tab.id, ")");
  }
  return { success: true, tabId: tab.id };
}

async function handleChatGptDone(data, chatTabId) {
  const { subject, body, recipientEmail, leadId, templateHasSignature } = data;
  const workflowKey = getWorkflowKey({ leadId, recipientEmail });
  const pending = pendingWorkflows.get(workflowKey);
  const campaignGmailAuthUser =
    pending && pending.data && pending.data.campaignGmailAuthUser
      ? String(pending.data.campaignGmailAuthUser).trim()
      : "";
  const campaignId =
    pending && pending.data && pending.data.campaignId
      ? String(pending.data.campaignId).trim()
      : "";

  if (campaignId && chatTabId) {
    await captureCampaignChatUrlFromTab(campaignId, chatTabId);
  }

  if (pending && pending.completed) {
    if (chatTabId) {
      try {
        await chrome.tabs.remove(chatTabId);
      } catch (_) {
        // Ignore if already closed.
      }
    }
    return { success: true, skipped: true, reason: "already-processed-by-fallback" };
  }
  if (pending) {
    pending.completed = true;
    pendingWorkflows.set(workflowKey, pending);
  }
  const customSignature = await getCustomSignatureSetting();
  const encodedTo = encodeURIComponent(recipientEmail || "");
  const encodedSu = encodeURIComponent(subject || "");
  const gmailBaseUrl = getGmailBaseUrl(campaignGmailAuthUser);
  // Open Gmail compose in the normal inbox context so Gmail does not exit a standalone compose route after send.
  // Do NOT put body in URL - it gets truncated. Content script will fill body.
  const gmailUrl = `${gmailBaseUrl}/#inbox?compose=new&to=${encodedTo}&su=${encodedSu}`;
  const tab = await chrome.tabs.create({ url: gmailUrl, active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(2000);
  let sentToGmail = await sendMessageToTabWithRetry(tab.id, {
    action: "fillAndSend",
    data: {
      to: recipientEmail || "",
      subject: subject || "",
      body: body || "",
      customSignature: customSignature || "",
      leadId: leadId || "",
      expectedGmailAuthUser: normalizeGmailAuthUser(campaignGmailAuthUser || ""),
      templateHasSignature: !!templateHasSignature,
      isFollowup: false,
      autoSend: true,
      scheduleSendTime: pending && pending.data && pending.data.scheduleSendTime ? pending.data.scheduleSendTime : "",
    },
  }, 7, 900);
  console.log("[Leads Extension] handleChatGptDone - scheduleSendTime sent to Gmail:", pending && pending.data && pending.data.scheduleSendTime ? pending.data.scheduleSendTime : "(NONE)");
  if (!sentToGmail) {
    console.warn("[Leads Extension] Initial Gmail handoff failed, retrying:", tab.id);
    if (!RUN_TABS_IN_BACKGROUND) {
      try {
        await chrome.tabs.update(tab.id, { active: true });
        await delay(1200);
      } catch (_) {
        // Ignore and retry anyway.
      }
    } else {
      await delay(2000);
    }
    sentToGmail = await sendMessageToTabWithRetry(tab.id, {
      action: "fillAndSend",
      data: {
        to: recipientEmail || "",
        subject: subject || "",
        body: body || "",
        customSignature: customSignature || "",
        leadId: leadId || "",
        expectedGmailAuthUser: normalizeGmailAuthUser(campaignGmailAuthUser || ""),
        templateHasSignature: !!templateHasSignature,
        isFollowup: false,
        autoSend: true,
        scheduleSendTime: pending && pending.data && pending.data.scheduleSendTime ? pending.data.scheduleSendTime : "",
      },
    }, 10, 1200);
    if (!sentToGmail) {
      console.error("[Leads Extension] Send message to Gmail tab failed after active retry (tab:", tab.id, ")");
    }
  }
  if (chatTabId) {
    try {
      await chrome.tabs.remove(chatTabId);
    } catch (_) {
      // Ignore if tab is already closed.
    }
  }
  return { success: true };
}

function getWorkflowKey(data) {
  const leadId = data && data.leadId ? String(data.leadId).trim() : "";
  if (leadId) return "lead:" + leadId;
  const recipientEmail = data && data.recipientEmail ? String(data.recipientEmail).trim().toLowerCase() : "";
  if (recipientEmail) return "email:" + recipientEmail;
  return "unknown:" + Date.now();
}

function normalizeGmailAuthUser(value) {
  const raw = String(value || "").trim();
  if (!raw) return "0";

  // If it's already an email, return it (Gmail URLs support /u/email@gmail.com)
  if (raw.includes("@")) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (String(parsed.hostname || "").toLowerCase() !== "mail.google.com") {
        return "0";
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      const mailIdx = parts.findIndex((p) => p.toLowerCase() === "mail");
      if (mailIdx !== -1 && parts[mailIdx + 1]?.toLowerCase() === "u" && parts[mailIdx + 2]) {
        return String(parts[mailIdx + 2]).trim() || "0";
      }
    } catch (_) {
      return "0";
    }
  }

  return raw;
}

function getGmailBaseUrl(authUserValue) {
  const authUser = normalizeGmailAuthUser(authUserValue);
  // Gmail handles the @ symbol raw in /u/ URLs better than %40.
  // CRITICAL: A trailing slash after the email/index is required to prevent redirects to /u/0.
  const encoded = encodeURIComponent(authUser).replace(/%40/g, "@");
  return "https://mail.google.com/mail/u/" + encoded + "/";
}

function normalizeChatGptUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const host = String(parsed.hostname || "").toLowerCase();
    if (parsed.protocol !== "https:") return "";
    if (host !== "chatgpt.com" && host !== "chat.openai.com") return "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function normalizeCampaignChatId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const host = String(parsed.hostname || "").toLowerCase();
      if (host !== "chatgpt.com" && host !== "chat.openai.com") {
        return "";
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] && segments[0].toLowerCase() === "c" && segments[1]) {
        return String(segments[1]).trim();
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  const prefixed = raw.match(/^c\/(.+)$/i);
  if (prefixed && prefixed[1]) {
    return String(prefixed[1]).trim();
  }

  return raw;
}

function resolveCampaignChatUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Allow direct project/chat URLs.
  if (/^https?:\/\//i.test(raw)) {
    const normalizedUrl = normalizeChatGptUrl(raw);
    if (normalizedUrl && isAllocatableChatUrl(normalizedUrl)) {
      return normalizedUrl;
    }
    return "";
  }

  // Allow chat id formats (c/<id> or plain id).
  const id = normalizeCampaignChatId(raw);
  if (!id) return "";
  return "https://chatgpt.com/c/" + encodeURIComponent(id);
}

function isAllocatableChatUrl(url) {
  const normalized = normalizeChatGptUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    const path = String(parsed.pathname || "").toLowerCase();
    if (/^\/c\/[^/]+/.test(path)) return true;
    if (/^\/g\/[^/]+/.test(path)) return true;
    if (path === "/projects" || path === "/project" || path.indexOf("/projects/") === 0) return true;
    return false;
  } catch (_) {
    return false;
  }
}

async function getCampaignChatUrl(campaignId) {
  const key = String(campaignId || "").trim();
  if (!key) return "";
  try {
    const stored = await chrome.storage.local.get({ [CAMPAIGN_CHAT_URLS_KEY]: {} });
    const map = stored && typeof stored[CAMPAIGN_CHAT_URLS_KEY] === "object" && stored[CAMPAIGN_CHAT_URLS_KEY]
      ? stored[CAMPAIGN_CHAT_URLS_KEY]
      : {};
    const mapped = normalizeChatGptUrl(map[key] || "");
    return mapped && isAllocatableChatUrl(mapped) ? mapped : "";
  } catch (_) {
    return "";
  }
}

async function setCampaignChatUrl(campaignId, chatUrl) {
  const key = String(campaignId || "").trim();
  if (!key) return { success: false, error: "campaignId is required" };
  const normalized = normalizeChatGptUrl(chatUrl);
  if (!normalized || !isAllocatableChatUrl(normalized)) {
    return { success: false, error: "Invalid ChatGPT chat/project URL" };
  }

  const stored = await chrome.storage.local.get({ [CAMPAIGN_CHAT_URLS_KEY]: {} });
  const map = stored && typeof stored[CAMPAIGN_CHAT_URLS_KEY] === "object" && stored[CAMPAIGN_CHAT_URLS_KEY]
    ? stored[CAMPAIGN_CHAT_URLS_KEY]
    : {};
  map[key] = normalized;
  await chrome.storage.local.set({ [CAMPAIGN_CHAT_URLS_KEY]: map });
  return { success: true, campaignId: key, chatUrl: normalized };
}

async function deleteCampaignChatUrl(campaignId) {
  const key = String(campaignId || "").trim();
  if (!key) return { success: false, error: "campaignId is required" };
  const stored = await chrome.storage.local.get({ [CAMPAIGN_CHAT_URLS_KEY]: {} });
  const map = stored && typeof stored[CAMPAIGN_CHAT_URLS_KEY] === "object" && stored[CAMPAIGN_CHAT_URLS_KEY]
    ? stored[CAMPAIGN_CHAT_URLS_KEY]
    : {};
  delete map[key];
  await chrome.storage.local.set({ [CAMPAIGN_CHAT_URLS_KEY]: map });
  return { success: true, campaignId: key };
}

async function handleChatGptLoadError(data, tabId) {
  const campaignId = data && data.campaignId ? String(data.campaignId).trim() : "";
  if (campaignId) {
    await deleteCampaignChatUrl(campaignId);
    console.log("[Leads Extension] Cleared ChatGPT mapping for campaign due to load error:", campaignId);
  }
  if (tabId) {
    chrome.tabs.update(tabId, { url: CHATGPT_DEFAULT_URL }).catch(() => { });
  }
  return { success: true };
}

async function captureCampaignChatUrlFromTab(campaignId, tabId) {
  const key = String(campaignId || "").trim();
  if (!key || !tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = normalizeChatGptUrl(tab && tab.url ? tab.url : "");
    if (!tabUrl || !isAllocatableChatUrl(tabUrl)) {
      return;
    }
    const save = await setCampaignChatUrl(key, tabUrl);
    if (save && save.success) {
      console.log("[Leads Extension] Saved campaign ChatGPT mapping:", key, tabUrl);
    }
  } catch (_) {
    // Ignore.
  }
}

async function findMostRecentOpenChatUrl() {
  try {
    const tabs = await chrome.tabs.query({});
    let best = null;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const url = normalizeChatGptUrl(tab && tab.url ? tab.url : "");
      if (!url || !isAllocatableChatUrl(url)) {
        continue;
      }
      const score = typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0;
      if (!best || score > best.score) {
        best = { url, score };
      }
    }
    return best ? best.url : "";
  } catch (_) {
    return "";
  }
}

async function handleSetCampaignChatUrl(data) {
  const campaignId = data && data.campaignId ? String(data.campaignId).trim() : "";
  const chatUrl = data && data.chatUrl ? String(data.chatUrl).trim() : "";
  return setCampaignChatUrl(campaignId, chatUrl);
}

async function handleGetCampaignChatUrl(data) {
  const campaignId = data && data.campaignId ? String(data.campaignId).trim() : "";
  if (!campaignId) {
    return { success: false, error: "campaignId is required" };
  }
  const chatUrl = await getCampaignChatUrl(campaignId);
  return { success: true, campaignId, chatUrl };
}

function createBulkAutomationState() {
  return {
    status: "idle",
    paused: false,
    stopRequested: false,
    runnerActive: false,
    phase: "send",
    followupEnabled: false,
    queue: [],
    total: 0,
    currentIndex: 0,
    processed: 0,
    sent: 0,
    followups: 0,
    failed: 0,
    skipped: 0,
    delayMinMs: BULK_DELAY_DEFAULT_MS,
    delayMaxMs: BULK_DELAY_DEFAULT_MS,
    lastDelayMs: 0,
    windowEnabled: false,
    sendWindowStart: "09:00",
    sendWindowEnd: "18:00",
    scheduleSendTime: "",
    limit: BULK_LIMIT_DEFAULT,
    campaignId: "",
    currentLeadId: "",
    currentRecipientEmail: "",
    startedAt: null,
    finishedAt: null,
    lastError: "",
  };
}

function normalizeBulkDelayMs(value) {
  const parsed = Number.parseInt(String(value ?? BULK_DELAY_DEFAULT_MS), 10);
  if (Number.isNaN(parsed)) {
    return BULK_DELAY_DEFAULT_MS;
  }
  return Math.max(BULK_DELAY_MIN_MS, Math.min(parsed, BULK_DELAY_MAX_MS));
}

function normalizeBulkDelayRange(minValue, maxValue) {
  const minDelayMs = normalizeBulkDelayMs(minValue);
  const maxDelayMs = normalizeBulkDelayMs(maxValue != null ? maxValue : minDelayMs);
  return {
    delayMinMs: Math.min(minDelayMs, maxDelayMs),
    delayMaxMs: Math.max(minDelayMs, maxDelayMs),
  };
}

function normalizeBulkLimit(value) {
  const parsed = Number.parseInt(String(value ?? BULK_LIMIT_DEFAULT), 10);
  if (Number.isNaN(parsed)) {
    return BULK_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(parsed, BULK_LIMIT_MAX));
}

function normalizeWindowTime(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) {
    return String(fallback || "");
  }
  const match = raw.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return String(fallback || "");
  }
  const hours = String(match[1]).padStart(2, "0");
  const minutes = String(match[2]).padStart(2, "0");
  return hours + ":" + minutes;
}

function parseWindowMinutes(value) {
  const normalized = normalizeWindowTime(value, "");
  if (!normalized) return null;
  const parts = normalized.split(":");
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return (hours * 60) + minutes;
}

function isWithinSendWindow(now, startWindow, endWindow) {
  const start = parseWindowMinutes(startWindow);
  const end = parseWindowMinutes(endWindow);
  if (start == null || end == null) {
    return true;
  }

  const minutesNow = (now.getHours() * 60) + now.getMinutes();
  if (start === end) {
    return true;
  }
  if (start < end) {
    return minutesNow >= start && minutesNow < end;
  }
  return minutesNow >= start || minutesNow < end;
}

function getRandomDelayMs(minValue, maxValue) {
  const minDelayMs = normalizeBulkDelayMs(minValue);
  const maxDelayMs = normalizeBulkDelayMs(maxValue != null ? maxValue : minDelayMs);
  const floor = Math.min(minDelayMs, maxDelayMs);
  const ceil = Math.max(minDelayMs, maxDelayMs);
  if (floor === ceil) {
    return floor;
  }
  return floor + Math.floor(Math.random() * (ceil - floor + 1));
}

function toBulkQueueItem(item, workflowType) {
  const source = item || {};
  const type = workflowType === "followup" ? "followup" : "send";
  const followupBody = String(source.followupBody || "").trim();
  return {
    workflowType: type,
    leadId: source.leadId ? String(source.leadId).trim() : "",
    campaignId: source.campaignId ? String(source.campaignId).trim() : "",
    campaignName: source.campaignName ? String(source.campaignName).trim() : "",
    campaignChatId: source.campaignChatId ? String(source.campaignChatId).trim() : "",
    campaignGmailAuthUser: source.campaignGmailAuthUser ? String(source.campaignGmailAuthUser).trim() : "",
    gmailThreadId: source.gmailThreadId ? String(source.gmailThreadId).trim() : "",
    recipientName: source.recipientName ? String(source.recipientName).trim() : "",
    recipientEmail: source.recipientEmail ? String(source.recipientEmail).trim() : "",
    websiteUrl: source.websiteUrl ? String(source.websiteUrl).trim() : "",
    website: source.website ? String(source.website).trim() : "",
    niche: source.niche ? String(source.niche).trim() : "",
    step: Number.isFinite(Number(source.step)) ? Number(source.step) : 1,
    campaignBody: source.campaignBody ? String(source.campaignBody) : "",
    campaignSubject: source.campaignSubject ? String(source.campaignSubject) : "",
    followup1: source.followup1 ? String(source.followup1) : "",
    followup2: source.followup2 ? String(source.followup2) : "",
    followupBody: followupBody,
    scheduleSendTime: source.scheduleSendTime || bulkAutomationState.scheduleSendTime || "",
  };
}

function buildFollowupSubject(subject) {
  const value = String(subject || "").trim();
  if (!value) return "Re: Quick note";
  if (/^re:/i.test(value)) return value;
  return "Re: " + value;
}

function getFollowupBodyFromItem(item) {
  const existing = String(item && item.followupBody ? item.followupBody : "").trim();
  if (existing) {
    return existing;
  }
  const step = Number(item && item.step ? item.step : 1);
  if (step === 1) {
    return String(item && item.followup1 ? item.followup1 : "").trim();
  }
  if (step === 2) {
    return String(item && item.followup2 ? item.followup2 : "").trim();
  }
  return "";
}

function getBulkWaiterKey(leadId) {
  const key = String(leadId || "").trim();
  return key ? "lead:" + key : "";
}

function getBulkAutomationPublicState() {
  const total = Number(bulkAutomationState.total || 0);
  const processed = Number(bulkAutomationState.processed || 0);
  return {
    status: bulkAutomationState.status,
    phase: bulkAutomationState.phase || "send",
    paused: !!bulkAutomationState.paused,
    stopRequested: !!bulkAutomationState.stopRequested,
    campaignId: bulkAutomationState.campaignId || "",
    delayMinMs: Number(bulkAutomationState.delayMinMs || 0),
    delayMaxMs: Number(bulkAutomationState.delayMaxMs || 0),
    delayMs: Number(bulkAutomationState.lastDelayMs || 0),
    followupEnabled: !!bulkAutomationState.followupEnabled,
    followups: Number(bulkAutomationState.followups || 0),
    windowEnabled: !!bulkAutomationState.windowEnabled,
    sendWindowStart: String(bulkAutomationState.sendWindowStart || ""),
    sendWindowEnd: String(bulkAutomationState.sendWindowEnd || ""),
    limit: Number(bulkAutomationState.limit || 0),
    total,
    currentIndex: Number(bulkAutomationState.currentIndex || 0),
    processed,
    sent: Number(bulkAutomationState.sent || 0),
    failed: Number(bulkAutomationState.failed || 0),
    skipped: Number(bulkAutomationState.skipped || 0),
    remaining: Math.max(total - processed, 0),
    currentLeadId: bulkAutomationState.currentLeadId || "",
    currentRecipientEmail: bulkAutomationState.currentRecipientEmail || "",
    startedAt: bulkAutomationState.startedAt,
    finishedAt: bulkAutomationState.finishedAt,
    lastError: bulkAutomationState.lastError || "",
  };
}

function resetBulkWorkflowWaiters() {
  const waiters = Array.from(bulkWorkflowWaiters.values());
  bulkWorkflowWaiters.clear();
  for (let i = 0; i < waiters.length; i++) {
    const waiter = waiters[i];
    if (waiter && waiter.timeoutId) {
      clearTimeout(waiter.timeoutId);
    }
    if (waiter && typeof waiter.reject === "function") {
      try {
        waiter.reject(new Error("Bulk automation was reset"));
      } catch (_) {
        // Ignore.
      }
    }
  }
}

function waitForBulkWorkflowCompletion(leadId, timeoutMs) {
  const key = getBulkWaiterKey(leadId);
  if (!key) {
    return Promise.reject(new Error("Lead ID is required for completion tracking"));
  }

  const existing = bulkWorkflowWaiters.get(key);
  if (existing) {
    if (existing.timeoutId) {
      clearTimeout(existing.timeoutId);
    }
    if (typeof existing.reject === "function") {
      try {
        existing.reject(new Error("Superseded by a newer workflow"));
      } catch (_) {
        // Ignore.
      }
    }
    bulkWorkflowWaiters.delete(key);
  }

  const timeout = Math.max(15000, Number(timeoutMs || BULK_WORKFLOW_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      bulkWorkflowWaiters.delete(key);

      // Mark the lead as "failed" in the dashboard so it doesn't stay "pending" forever
      if (leadId) {
        getApiBaseUrl().then(function(base) {
          return fetch(base + "/api/update-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: String(leadId), status: "failed" })
          });
        }).catch(function() {});

        // Close the stuck ChatGPT tab if we have its ID in pendingWorkflows
        var workflowKeyForTimeout = "lead:" + String(leadId).trim();
        var pendingEntry = pendingWorkflows.get(workflowKeyForTimeout);
        if (pendingEntry && pendingEntry.chatTabId) {
          chrome.tabs.remove(pendingEntry.chatTabId).catch(function() {});
          pendingWorkflows.delete(workflowKeyForTimeout);
        }
      }

      reject(new Error("Workflow timeout while waiting for lead update"));
    }, timeout);
    bulkWorkflowWaiters.set(key, { resolve, reject, timeoutId });
  });
}

function resolveBulkWorkflowCompletion(leadId, payload) {
  const key = getBulkWaiterKey(leadId);
  if (!key) {
    return false;
  }
  const waiter = bulkWorkflowWaiters.get(key);
  if (!waiter) {
    return false;
  }
  bulkWorkflowWaiters.delete(key);
  if (waiter.timeoutId) {
    clearTimeout(waiter.timeoutId);
  }
  try {
    waiter.resolve(payload || { success: true });
  } catch (_) {
    // Ignore.
  }
  return true;
}

async function fetchSendQueue(limit, campaignId) {
  const maxLeads = normalizeBulkLimit(limit);
  const params = new URLSearchParams();
  params.set("limit", String(maxLeads));
  const normalizedCampaignId = String(campaignId || "").trim();
  if (normalizedCampaignId) {
    params.set("campaignId", normalizedCampaignId);
  }

  const response = await fetch((await getApiBaseUrl()) + "/api/send-queue?" + params.toString());

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Send queue fetch failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const leads = result && Array.isArray(result.leads) ? result.leads : [];
  return leads.map((item) => toBulkQueueItem(item, "send"));
}

async function fetchFollowupQueue(limit, campaignId) {
  const maxLeads = normalizeBulkLimit(limit);
  const params = new URLSearchParams();
  params.set("limit", String(maxLeads));
  const normalizedCampaignId = String(campaignId || "").trim();
  if (normalizedCampaignId) {
    params.set("campaignId", normalizedCampaignId);
  }

  const response = await fetch((await getApiBaseUrl()) + "/api/followup-queue?" + params.toString());

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Follow-up queue fetch failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const leads = result && Array.isArray(result.leads) ? result.leads : [];
  return leads.map((item) => toBulkQueueItem(item, "followup"));
}

async function waitWhilePausedOrStopped() {
  while (bulkAutomationState.paused && !bulkAutomationState.stopRequested) {
    bulkAutomationState.status = "paused";
    await delay(350);
  }
  return !bulkAutomationState.stopRequested;
}

async function waitForSendWindowIfNeeded() {
  if (!bulkAutomationState.windowEnabled) {
    return true;
  }

  while (!bulkAutomationState.stopRequested) {
    const canContinue = await waitWhilePausedOrStopped();
    if (!canContinue) {
      return false;
    }

    if (isWithinSendWindow(new Date(), bulkAutomationState.sendWindowStart, bulkAutomationState.sendWindowEnd)) {
      return true;
    }

    bulkAutomationState.status = "waiting-window";
    await delay(30000);
  }

  return false;
}

async function sleepWithBulkControls(ms) {
  const waitMs = Math.max(0, Number(ms || 0));
  let elapsed = 0;
  while (elapsed < waitMs) {
    const canContinue = await waitWhilePausedOrStopped();
    if (!canContinue) {
      return false;
    }
    const slice = Math.min(500, waitMs - elapsed);
    await delay(slice);
    elapsed += slice;
  }
  return !bulkAutomationState.stopRequested;
}

async function runSingleBulkWorkflow(item) {
  const current = item || null;
  const leadId = current && current.leadId ? String(current.leadId).trim() : "";
  const recipientEmail = current && current.recipientEmail ? String(current.recipientEmail).trim() : "";

  bulkAutomationState.currentLeadId = leadId;
  bulkAutomationState.currentRecipientEmail = recipientEmail;

  if (!leadId || !recipientEmail) {
    bulkAutomationState.skipped += 1;
    return;
  }

  const workflowType = current && current.workflowType === "followup" ? "followup" : "send";
  if (workflowType === "followup") {
    const followupBody = getFollowupBodyFromItem(current);
    if (!followupBody) {
      bulkAutomationState.skipped += 1;
      return;
    }

    const payload = {
      leadId: leadId,
      to: recipientEmail,
      subject: buildFollowupSubject(current.campaignSubject || ""),
      body: followupBody,
      threadId: current.gmailThreadId || null,
      campaignGmailAuthUser: current.campaignGmailAuthUser || "",
    };
    const completionPromise = waitForBulkWorkflowCompletion(leadId, BULK_WORKFLOW_TIMEOUT_MS);
    await handleStartFollowupWorkflow(payload);
    await completionPromise;
    bulkAutomationState.followups += 1;
    return;
  }

  const completionPromise = waitForBulkWorkflowCompletion(leadId, BULK_WORKFLOW_TIMEOUT_MS);
  // Always inject the live scheduleSendTime from bulkAutomationState at dispatch time,
  // offset by (currentIndex × scheduleStaggerMs) so each lead lands at a different time.
  const baseScheduleTime = current.scheduleSendTime || bulkAutomationState.scheduleSendTime || "";
  const staggerMs = bulkAutomationState.scheduleStaggerMs || 0;
  const leadIndex = bulkAutomationState.currentIndex || 0;
  let effectiveScheduleTime = baseScheduleTime;
  if (baseScheduleTime && staggerMs > 0 && leadIndex > 0) {
    try {
      const baseDate = new Date(baseScheduleTime);
      if (!isNaN(baseDate.getTime())) {
        const staggeredDate = new Date(baseDate.getTime() + leadIndex * staggerMs);
        const y = staggeredDate.getFullYear();
        const mo = String(staggeredDate.getMonth() + 1).padStart(2, "0");
        const d = String(staggeredDate.getDate()).padStart(2, "0");
        const h = String(staggeredDate.getHours()).padStart(2, "0");
        const mi = String(staggeredDate.getMinutes()).padStart(2, "0");
        effectiveScheduleTime = `${y}-${mo}-${d}T${h}:${mi}`;
      }
    } catch (e) {
      console.warn("[Leads Extension] Failed to compute staggered time:", e);
    }
  }
  const workflowData = Object.assign({}, current, {
    scheduleSendTime: effectiveScheduleTime,
  });
  console.log("[Leads Extension] Bulk: dispatching handleStartWorkflow for", leadId,
    "index:", leadIndex,
    "scheduleSendTime:", workflowData.scheduleSendTime || "(none — immediate send)",
    staggerMs > 0 ? ("stagger: " + (staggerMs / 60000) + "min") : "");
  await handleStartWorkflow(workflowData);
  await completionPromise;
  bulkAutomationState.sent += 1;
}

async function processBulkQueueItems() {
  while (bulkAutomationState.currentIndex < bulkAutomationState.total) {
    if (bulkAutomationState.stopRequested) {
      break;
    }

    const canContinue = await waitWhilePausedOrStopped();
    if (!canContinue) {
      break;
    }

    const canSendNow = await waitForSendWindowIfNeeded();
    if (!canSendNow) {
      break;
    }

    bulkAutomationState.status = "running";
    const current = bulkAutomationState.queue[bulkAutomationState.currentIndex] || null;

    try {
      await runSingleBulkWorkflow(current);
    } catch (error) {
      bulkAutomationState.failed += 1;
      bulkAutomationState.lastError = error && error.message ? String(error.message) : "Unknown workflow error";
      console.error("[Leads Extension] Bulk workflow failed for lead:", current && current.leadId ? current.leadId : "(unknown)", error);
    } finally {
      bulkAutomationState.processed += 1;
      bulkAutomationState.currentIndex += 1;
      bulkAutomationState.currentLeadId = "";
      bulkAutomationState.currentRecipientEmail = "";
    }

    if (bulkAutomationState.currentIndex < bulkAutomationState.total) {
      const delayMs = getRandomDelayMs(bulkAutomationState.delayMinMs, bulkAutomationState.delayMaxMs);
      bulkAutomationState.lastDelayMs = delayMs;
      const continueRunning = await sleepWithBulkControls(delayMs);
      if (!continueRunning) {
        break;
      }
    }
  }
}

async function runBulkAutomationQueue() {
  if (bulkAutomationState.runnerActive) {
    return;
  }

  bulkAutomationState.runnerActive = true;
  bulkAutomationState.startedAt = Date.now();
  bulkAutomationState.finishedAt = null;
  bulkAutomationState.lastError = "";
  bulkAutomationState.phase = "send";
  bulkAutomationState.lastDelayMs = 0;

  try {
    await processBulkQueueItems();

    if (!bulkAutomationState.stopRequested && bulkAutomationState.followupEnabled) {
      bulkAutomationState.phase = "followup";
      const followupQueue = await fetchFollowupQueue(bulkAutomationState.limit, bulkAutomationState.campaignId);
      if (followupQueue.length > 0) {
        for (let i = 0; i < followupQueue.length; i++) {
          bulkAutomationState.queue.push(followupQueue[i]);
        }
        bulkAutomationState.total += followupQueue.length;
        await processBulkQueueItems();
      }
    }

    bulkAutomationState.status = bulkAutomationState.stopRequested ? "stopped" : "completed";
  } finally {
    bulkAutomationState.runnerActive = false;
    bulkAutomationState.paused = false;
    bulkAutomationState.stopRequested = false;
    bulkAutomationState.currentLeadId = "";
    bulkAutomationState.currentRecipientEmail = "";
    bulkAutomationState.finishedAt = Date.now();
    resetBulkWorkflowWaiters();
  }
}

async function handleStartBulkAutomation(data) {
  if (bulkAutomationState.runnerActive || bulkAutomationState.status === "running" || bulkAutomationState.status === "paused") {
    return {
      success: false,
      error: "Bulk automation is already running",
      state: getBulkAutomationPublicState(),
    };
  }

  const campaignId = data && data.campaignId ? String(data.campaignId).trim() : "";
  const delayRange = normalizeBulkDelayRange(
    data && (data.delayMinMs != null ? data.delayMinMs : data.delayMs),
    data && (data.delayMaxMs != null ? data.delayMaxMs : data.delayMs)
  );
  const limit = normalizeBulkLimit(data && data.limit);
  const followupEnabled = !!(data && data.followupEnabled);
  const sendWindowStart = normalizeWindowTime(data && data.sendWindowStart, "09:00");
  const sendWindowEnd = normalizeWindowTime(data && data.sendWindowEnd, "18:00");
  const windowEnabled = !!(data && data.windowEnabled && sendWindowStart && sendWindowEnd);

  // IMPORTANT: set scheduleSendTime BEFORE fetchSendQueue so that toBulkQueueItem
  // (called inside fetchSendQueue) picks it up from bulkAutomationState correctly.
  bulkAutomationState.scheduleSendTime = data && data.scheduleSendTime ? String(data.scheduleSendTime).trim() : "";
  bulkAutomationState.scheduleStaggerMs = data && data.scheduleStaggerMs > 0 ? Number(data.scheduleStaggerMs) : 0;

  const queue = await fetchSendQueue(limit, campaignId);

  bulkAutomationState.queue = Array.isArray(queue) ? queue : [];
  bulkAutomationState.total = bulkAutomationState.queue.length;
  bulkAutomationState.currentIndex = 0;
  bulkAutomationState.processed = 0;
  bulkAutomationState.sent = 0;
  bulkAutomationState.followups = 0;
  bulkAutomationState.failed = 0;
  bulkAutomationState.skipped = 0;
  bulkAutomationState.delayMinMs = delayRange.delayMinMs;
  bulkAutomationState.delayMaxMs = delayRange.delayMaxMs;
  bulkAutomationState.lastDelayMs = 0;
  bulkAutomationState.followupEnabled = followupEnabled;
  bulkAutomationState.windowEnabled = windowEnabled;
  bulkAutomationState.sendWindowStart = sendWindowStart;
  bulkAutomationState.sendWindowEnd = sendWindowEnd;
  // (scheduleSendTime already set above before fetchSendQueue)
  bulkAutomationState.limit = limit;
  bulkAutomationState.campaignId = campaignId;
  bulkAutomationState.phase = "send";
  bulkAutomationState.currentLeadId = "";
  bulkAutomationState.currentRecipientEmail = "";
  bulkAutomationState.startedAt = null;
  bulkAutomationState.finishedAt = null;
  bulkAutomationState.lastError = "";
  bulkAutomationState.paused = false;
  bulkAutomationState.stopRequested = false;
  bulkAutomationState.status = (bulkAutomationState.total > 0 || followupEnabled) ? "running" : "idle";
  resetBulkWorkflowWaiters();

  if (bulkAutomationState.total === 0 && !followupEnabled) {
    return {
      success: true,
      started: false,
      message: "No pending leads found for automation",
      state: getBulkAutomationPublicState(),
    };
  }

  runBulkAutomationQueue().catch((err) => {
    bulkAutomationState.status = "failed";
    bulkAutomationState.lastError = err && err.message ? String(err.message) : "Bulk runner crashed";
    bulkAutomationState.runnerActive = false;
    bulkAutomationState.paused = false;
    bulkAutomationState.stopRequested = false;
    bulkAutomationState.finishedAt = Date.now();
    resetBulkWorkflowWaiters();
    console.error("[Leads Extension] Bulk automation crashed:", err);
  });

  return {
    success: true,
    started: true,
    state: getBulkAutomationPublicState(),
  };
}

async function handlePauseBulkAutomation() {
  if (!bulkAutomationState.runnerActive) {
    return { success: false, error: "Bulk automation is not currently running", state: getBulkAutomationPublicState() };
  }
  if (bulkAutomationState.status !== "running" && bulkAutomationState.status !== "waiting-window") {
    return { success: false, error: "Bulk automation is not currently running", state: getBulkAutomationPublicState() };
  }
  bulkAutomationState.paused = true;
  bulkAutomationState.status = "paused";
  return { success: true, state: getBulkAutomationPublicState() };
}

async function handleResumeBulkAutomation() {
  if (!bulkAutomationState.runnerActive || bulkAutomationState.status !== "paused") {
    return { success: false, error: "Bulk automation is not paused", state: getBulkAutomationPublicState() };
  }
  bulkAutomationState.paused = false;
  bulkAutomationState.status = "running";
  return { success: true, state: getBulkAutomationPublicState() };
}

async function handleStopBulkAutomation() {
  if (!bulkAutomationState.runnerActive &&
    bulkAutomationState.status !== "paused" &&
    bulkAutomationState.status !== "running" &&
    bulkAutomationState.status !== "waiting-window" &&
    bulkAutomationState.status !== "stopping") {
    return { success: false, error: "Bulk automation is not active", state: getBulkAutomationPublicState() };
  }
  bulkAutomationState.stopRequested = true;
  bulkAutomationState.paused = false;
  bulkAutomationState.status = "stopping";
  return { success: true, state: getBulkAutomationPublicState() };
}

async function handleGetBulkAutomationState() {
  return { success: true, state: getBulkAutomationPublicState() };
}

function fillCampaignPlaceholders(template, data) {
  const text = String(template || "");
  const websiteUrl = (data && (data.websiteUrl || data.website) ? String(data.websiteUrl || data.website) : "").trim();
  const niche = (data && data.niche ? String(data.niche) : "").trim();
  const recipientName = (data && data.recipientName ? String(data.recipientName) : "").trim();
  const firstName = recipientName.split(/\s+/)[0] || "there";

  return text
    .replace(/\(Website\)/gi, websiteUrl || "N/A")
    .replace(/\(Niche\)/gi, niche || "N/A")
    .replace(/\{websiteurl\}/gi, websiteUrl || "N/A")
    .replace(/\{website\}/gi, websiteUrl || "N/A")
    .replace(/\{niche\}/gi, niche || "N/A")
    .replace(/\{\{\s*FirstName\s*\}\}/gi, firstName)
    .replace(/\{firstname\}/gi, firstName);
}

async function openGmailFromFallback(data, chatTabId) {
  const recipientEmail = data && data.recipientEmail ? String(data.recipientEmail).trim() : "";
  const leadId = data && data.leadId ? String(data.leadId).trim() : "";
  const campaignSubject = data && data.campaignSubject ? String(data.campaignSubject).trim() : "";
  const campaignBody = data && data.campaignBody ? String(data.campaignBody) : "";
  const campaignGmailAuthUser = data && data.campaignGmailAuthUser ? String(data.campaignGmailAuthUser).trim() : "";

  // If campaignBody is present it is a ChatGPT prompt, not a ready-to-send email.
  // Sending it to Gmail would deliver the raw AI instructions to the recipient.
  // Abort silently so no garbage email is sent; the user can retry the lead manually.
  if (campaignBody.trim()) {
    console.warn(
      "[Leads Extension] Fallback aborted for lead",
      leadId || recipientEmail,
      "— ChatGPT timed out and campaignBody is an AI prompt, not a real email. Skipping send to prevent sending raw instructions."
    );
    if (chatTabId) {
      try { await chrome.tabs.remove(chatTabId); } catch (_) {}
    }
    return;
  }

  const subject = campaignSubject || "Quick note";
  const body = fillCampaignPlaceholders(campaignBody, data) || "Hi,\n\nBest regards,";
  const customSignature = await getCustomSignatureSetting();

  const encodedTo = encodeURIComponent(recipientEmail || "");
  const encodedSu = encodeURIComponent(subject || "");
  const gmailBaseUrl = getGmailBaseUrl(campaignGmailAuthUser);
  const gmailUrl = `${gmailBaseUrl}/#inbox?compose=new&to=${encodedTo}&su=${encodedSu}`;
  if (!recipientEmail) {
    throw new Error("Fallback workflow missing recipient email");
  }

  const tab = await chrome.tabs.create({ url: gmailUrl, active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(2000);
  let sentToGmail = await sendMessageToTabWithRetry(tab.id, {
    action: "fillAndSend",
    data: {
      to: recipientEmail || "",
      subject: subject || "",
      body: body || "",
      customSignature: customSignature || "",
      leadId: leadId || "",
      expectedGmailAuthUser: normalizeGmailAuthUser(campaignGmailAuthUser || ""),
      templateHasSignature: true,
      isFollowup: false,
      autoSend: true,
      scheduleSendTime: data.scheduleSendTime || "",
    },
  }, 7, 900);

  if (!sentToGmail) {
    console.warn("[Leads Extension] Fallback Gmail handoff failed, retrying:", tab.id);
    if (!RUN_TABS_IN_BACKGROUND) {
      try {
        await chrome.tabs.update(tab.id, { active: true });
        await delay(1200);
      } catch (_) {
        // Ignore and retry anyway.
      }
    } else {
      await delay(2000);
    }
    sentToGmail = await sendMessageToTabWithRetry(tab.id, {
      action: "fillAndSend",
      data: {
        to: recipientEmail || "",
        subject: subject || "",
        body: body || "",
        customSignature: customSignature || "",
        leadId: leadId || "",
        expectedGmailAuthUser: normalizeGmailAuthUser(campaignGmailAuthUser || ""),
        templateHasSignature: true,
        isFollowup: false,
        autoSend: true,
        scheduleSendTime: data.scheduleSendTime || "",
      },
    }, 10, 1200);
    if (!sentToGmail) {
      console.error("[Leads Extension] Fallback Gmail handoff failed after active retry (tab:", tab.id, ")");
    }
  }

  if (chatTabId) {
    try {
      await chrome.tabs.remove(chatTabId);
    } catch (_) {
      // Ignore.
    }
  }
}

async function handleStartFollowupWorkflow(data) {
  const { to, subject, body, leadId, threadId, campaignGmailAuthUser } = data;
  const customSignature = await getCustomSignatureSetting();
  const gmailBaseUrl = getGmailBaseUrl(campaignGmailAuthUser || "");
  let gmailUrl;
  let openReply = false;
  const tid = threadId ? String(threadId).trim().replace(/^#+/, "") : "";
  if (tid) {
    // Try opening the thread first (works with alphanumeric ID; numeric may show "no longer exists").
    // Use the base URL which already has a trailing slash.
    gmailUrl = gmailBaseUrl + "#all/" + tid;
    openReply = true;
  } else {
    // No thread ID: open new compose (e.g. first email was sent outside extension)
    const encodedTo = encodeURIComponent(to || "");
    const encodedSu = encodeURIComponent(subject || "");
    gmailUrl = gmailBaseUrl + "#inbox?compose=new&to=" + encodedTo + "&su=" + encodedSu;
  }
  const tab = await chrome.tabs.create({ url: gmailUrl, active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(threadId ? 3000 : 2000);
  const sentToGmail = await sendMessageToTabWithRetry(tab.id, {
    action: "fillAndSend",
    data: {
      to: to || "",
      subject: subject || "",
      body: body || "",
      customSignature: customSignature || "",
      leadId: leadId || "",
      expectedGmailAuthUser: normalizeGmailAuthUser(campaignGmailAuthUser || ""),
      isFollowup: true,
      openReply: openReply,
      threadIdForUrl: threadId ? String(threadId).trim().replace(/^#+/, "") : "",
      autoSend: true,
    },
  }, 7, 900);
  if (!sentToGmail) {
    console.error("[Leads Extension] Send follow-up message to Gmail tab failed after retries");
  }
  return { success: true };
}

async function getCustomSignatureSetting() {
  try {
    const stored = await chrome.storage.local.get({ customSignature: "" });
    const value = stored && typeof stored.customSignature === "string"
      ? stored.customSignature
      : "";
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  } catch (_) {
    return "";
  }
}

async function handleSetCustomSignature(data) {
  const value = data && typeof data.customSignature === "string"
    ? data.customSignature
    : "";
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  await chrome.storage.local.set({ customSignature: normalized });
  return { success: true, customSignature: normalized };
}

async function handleGetCustomSignature() {
  const customSignature = await getCustomSignatureSetting();
  return { success: true, customSignature };
}

async function ensureReplyCheckAlarm() {
  const existing = await chrome.alarms.get(REPLY_CHECK_ALARM);
  if (existing) {
    return;
  }
  await chrome.alarms.create(REPLY_CHECK_ALARM, {
    delayInMinutes: 2,
    periodInMinutes: REPLY_CHECK_PERIOD_MINUTES,
  });
}

async function fetchReplyCheckQueue(limit) {
  const maxLeads = Number(limit || 30);
  const response = await fetch(
    (await getApiBaseUrl()) + "/api/reply-check-queue?limit=" + encodeURIComponent(String(maxLeads))
  );

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Reply-check queue fetch failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const leads = result && Array.isArray(result.leads) ? result.leads : [];
  return leads;
}

async function runDailyReplySweep(trigger) {
  if (replySweepRunning) {
    return { success: true, skipped: true, reason: "already-running" };
  }
  if (replySweepDisabled) {
    return { success: true, skipped: true, reason: "disabled" };
  }
  replySweepRunning = true;
  replySweepStopped = false;

  try {
    const queue = await fetchReplyCheckQueue(50);
    let checked = 0;
    let marked = 0;

    if (queue.length === 0) {
      return { success: true, checked: 0, marked: 0 };
    }

    // Group leads by Gmail auth user so we open ONE tab per account and
    // navigate it between threads — instead of opening a new tab per lead.
    var accountGroups = {};
    for (var qi = 0; qi < queue.length; qi++) {
      var qLead = queue[qi] || {};
      var acct = qLead.campaignGmailAuthUser ? String(qLead.campaignGmailAuthUser).trim() : "";
      if (!accountGroups[acct]) accountGroups[acct] = [];
      accountGroups[acct].push(qLead);
    }

    var accountKeys = Object.keys(accountGroups);
    for (var ai = 0; ai < accountKeys.length; ai++) {
      if (replySweepStopped) break;

      var acctKey = accountKeys[ai];
      var acctLeads = accountGroups[acctKey];
      var sharedTabId = null;

      for (var li = 0; li < acctLeads.length; li++) {
        if (replySweepStopped) break;

        var sweepLead = acctLeads[li];
        var sweepLeadId = sweepLead.id ? String(sweepLead.id) : "";
        var sweepThreadId = sweepLead.gmailThreadId ? String(sweepLead.gmailThreadId).trim().replace(/^#+/, "") : "";
        var sweepEmail = sweepLead.recipientEmail ? String(sweepLead.recipientEmail).trim().toLowerCase() : "";
        var sweepAuthUser = sweepLead.campaignGmailAuthUser ? String(sweepLead.campaignGmailAuthUser).trim() : "";

        if (!sweepLeadId || !sweepThreadId || !sweepEmail) continue;

        var sweepGmailUrl = getGmailBaseUrl(sweepAuthUser) + "#all/" + encodeURIComponent(sweepThreadId);

        try {
          if (sharedTabId === null) {
            // First lead for this account: open a fresh tab
            var newTab = await chrome.tabs.create({ url: sweepGmailUrl, active: !RUN_TABS_IN_BACKGROUND });
            sharedTabId = newTab.id;
            await waitForTabReady(sharedTabId);
            await delay(2200);
          } else {
            // Subsequent leads: navigate the existing tab (much faster — no full page load)
            await chrome.tabs.update(sharedTabId, { url: sweepGmailUrl });
            await waitForTabReady(sharedTabId);
            await delay(1500);
          }

          checked += 1;
          var sweepResponse = await sendMessageToTabWithResponseRetry(sharedTabId, {
            action: "checkThreadReply",
            data: {
              threadId: sweepThreadId,
              recipientEmail: sweepEmail,
              leadId: sweepLeadId,
            },
          }, 8, 900);

          if (!sweepResponse || sweepResponse.success !== true) {
            console.warn("[Leads Extension Background] Reply check failed for lead", sweepLeadId,
              sweepResponse && sweepResponse.error ? sweepResponse.error : "no response");
          } else {
            if (sweepResponse.replied && sweepLeadId) {
              await handleMarkLeadReplied({ leadId: sweepLeadId, replyBody: sweepResponse.replyBody || null });
              marked += 1;
            }
            if (sweepResponse.bounced && sweepLeadId) {
              await handleMarkLeadBounced({ leadId: sweepLeadId });
            }
          }

          // Always stamp lastReplyCheckedAt so the queue rotates fairly.
          if (sweepLeadId) {
            getApiBaseUrl().then(function(base) {
              fetch(base + "/api/mark-reply-checked", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId: sweepLeadId }),
              }).catch(function() {});
            }).catch(function() {});
          }
        } catch (sweepErr) {
          console.warn("[Leads Extension Background] Reply check error for lead", sweepLeadId, sweepErr);
        }

        await delay(600);
      }

      // Done with this account — close the shared tab
      if (sharedTabId !== null) {
        try { await chrome.tabs.remove(sharedTabId); } catch (_) {}
        sharedTabId = null;
      }
    }

    const stopReason = replySweepStopped ? " (stopped early)" : "";
    console.log(
      "[Leads Extension Background] Daily reply sweep completed" + stopReason + ":",
      "trigger=" + String(trigger || "unknown"),
      "checked=" + checked,
      "marked=" + marked
    );

    return { success: true, checked, marked, stopped: replySweepStopped };
  } finally {
    replySweepRunning = false;
    replySweepStopped = false;
  }
}

async function handleCheckReplyByThread(data) {
  const leadId = data && data.leadId ? String(data.leadId) : "";
  const threadId = data && data.threadId ? String(data.threadId).trim().replace(/^#+/, "") : "";
  const recipientEmail = data && data.recipientEmail ? String(data.recipientEmail).trim().toLowerCase() : "";
  const campaignGmailAuthUser = data && data.campaignGmailAuthUser ? String(data.campaignGmailAuthUser).trim() : "";

  if (!threadId || !recipientEmail) {
    return { success: false, error: "threadId and recipientEmail are required" };
  }

  const gmailBaseUrl = getGmailBaseUrl(campaignGmailAuthUser);
  const gmailUrl = gmailBaseUrl + "#all/" + encodeURIComponent(threadId);
  const tab = await chrome.tabs.create({ url: gmailUrl, active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(2200);

  const response = await sendMessageToTabWithResponseRetry(tab.id, {
    action: "checkThreadReply",
    data: {
      threadId: threadId,
      recipientEmail: recipientEmail,
      leadId: leadId,
    },
  }, 8, 900);

  try {
    await chrome.tabs.remove(tab.id);
  } catch (_) {
    // Ignore if tab is already closed.
  }

  if (!response || response.success !== true) {
    return { success: false, error: response && response.error ? response.error : "Reply check failed" };
  }

  if (response.replied && leadId) {
    await handleMarkLeadReplied({ leadId: leadId, replyBody: response.replyBody || null });
  }

  if (response.bounced && leadId) {
    await handleMarkLeadBounced({ leadId: leadId });
  }

  return {
    success: true,
    replied: !!response.replied,
    senders: Array.isArray(response.senders) ? response.senders : [],
  };
}

async function handleMarkLeadReplied(data) {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(baseUrl + "/api/update-replied", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Update replied failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const updatedLead = result && result.lead ? result.lead : null;
  if (updatedLead) {
    notifyDashboardTabs(updatedLead);
  }

  return { success: true, data: result };
}

async function handleMarkLeadBounced(data) {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(baseUrl + "/api/update-bounced", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Update bounced failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const updatedLead = result && result.lead ? result.lead : null;
  if (updatedLead) {
    notifyDashboardTabs(updatedLead);
  }

  return { success: true, data: result };
}

async function handleSendScheduleError(data) {
  const email = String(data.email || "").trim();
  const errorMsg = String(data.error || "Unknown scheduling error").trim();
  if (!email) return { success: false, error: "Missing email" };

  try {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(baseUrl + "/api/update-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        status: "Failed: Schedule Send (" + errorMsg + ")",
        timestamp: new Date().toISOString()
      }),
    });
    if (!response.ok) {
      console.error("[Leads Extension Background] Failed to record schedule error to DB", response.status);
    }
  } catch (e) {
    console.error("[Leads Extension Background] Error hitting update-send for schedule error", e);
  }

  // Update bulk state if it was part of a bulk run
  if (bulkAutomationState.status === "running" && bulkAutomationState.currentRecipientEmail === email) {
    bulkAutomationState.failed = (bulkAutomationState.failed || 0) + 1;
    bulkAutomationState.lastError = `Schedule Send Failed: ${errorMsg}`;
  }
  return { success: true };
}

async function handleUpdateFollowup(data) {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(baseUrl + "/api/update-followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      "Update follow-up failed with status " + response.status;
    throw new Error(errorMessage);
  }

  const updatedLead = result && result.lead ? result.lead : null;
  const leadId = (data && data.leadId) ? String(data.leadId).trim() : (updatedLead && updatedLead.id ? String(updatedLead.id) : "");
  if (leadId) {
    resolveBulkWorkflowCompletion(leadId, { success: true, lead: updatedLead, type: "followup" });
    if (updatedLead) {
      notifyDashboardTabs(updatedLead);
    }
  }

  return { success: true, data: result };
}

async function handleValidateFollowup(data) {
  const leadId = data && data.leadId;
  if (!leadId) throw new Error("Missing leadId for validation");

  const response = await fetch((await getApiBaseUrl()) + "/api/validate-followup?leadId=" + encodeURIComponent(leadId));
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Validation failed");
  }

  return result;
}

async function handleUpdateLeadStatus(data) {
  const response = await fetch((await getApiBaseUrl()) + "/api/update-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }

  if (!response.ok) {
    const errorMessage =
      (result && (result.error || result.message)) ||
      `Update failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const updatedLead = result && result.lead ? result.lead : null;
  const leadId = (data && data.leadId) ? String(data.leadId).trim() : (updatedLead && updatedLead.id ? String(updatedLead.id) : "");
  if (leadId) {
    resolveBulkWorkflowCompletion(leadId, { success: true, lead: updatedLead, type: "send" });
    if (updatedLead) {
      notifyDashboardTabs(updatedLead);
    }
  }

  return { success: true, data: result };
}

async function notifyDashboardTabs(lead) {
  const tabs = await chrome.tabs.query({});
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (!tab.id || !tab.url) {
      continue;
    }
    if (!/^https?:\/\/.+\/dashboard(?:[/?#]|$)/i.test(tab.url)) {
      continue;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "leadUpdated",
        lead,
      });
    } catch (_) {
      // Ignore tabs without an active dashboard content script.
    }
  }
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 800);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 800);
      }
    }).catch(() => setTimeout(resolve, 2000));
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendMessageToTabWithRetry(tabId, payload, retries, delayMs) {
  const attempts = retries || 5;
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch (err) {
      lastError = err;
      if (!RUN_TABS_IN_BACKGROUND && i === Math.floor(attempts / 2)) {
        try {
          await chrome.tabs.update(tabId, { active: true });
        } catch (_) {
          // Ignore.
        }
      }
      await delay(delayMs || 600);
    }
  }
  if (lastError) {
    console.warn("[Leads Extension] sendMessageToTabWithRetry failed for tab", tabId, "payload action:", payload && payload.action, "error:", lastError && lastError.message ? lastError.message : lastError);
  }
  return false;
}

async function sendMessageToTabWithResponseRetry(tabId, payload, retries, delayMs) {
  const attempts = retries || 5;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, payload);
      if (response != null) {
        return response;
      }
    } catch (_) {
      // Retry.
    }
    await delay(delayMs || 600);
  }
  return null;
}

function buildPrompt(data) {
  const campaignBody = (data.campaignBody || "").trim();
  if (campaignBody) {
    return buildPromptFromCampaignBody(data, campaignBody);
  }

  const websiteUrl = (data.websiteUrl || data.website || "").trim();
  const niche = (data.niche || "").trim();
  if (websiteUrl || niche) {
    return buildGuestPostPrompt(data);
  }

  return buildColdOutreachPrompt(data);
}

function buildWebsiteContextBlock(data) {
  const ctx = data.websiteContext;
  if (!ctx) return "";
  const parts = [];
  if (ctx.title) parts.push("- Business name / page title: " + ctx.title);
  if (ctx.description) parts.push("- What they do: " + ctx.description);
  if (ctx.firstPara) parts.push("- Site excerpt: " + ctx.firstPara);
  if (parts.length === 0) return "";
  return "\n\nCompany context (use this to personalise the email — reference something specific):\n" + parts.join("\n");
}

function buildPromptFromCampaignBody(data, template) {
  const websiteUrl = (data.websiteUrl || data.website || "").trim() || "N/A";
  const niche = (data.niche || "").trim() || "N/A";
  const name = data.recipientName || "Recipient";
  const email = data.recipientEmail || "";

  let prompt = template
    .replace(/\(Website\)/gi, websiteUrl)
    .replace(/\(Niche\)/gi, niche)
    .replace(/\{websiteurl\}/gi, websiteUrl)
    .replace(/\{website\}/gi, websiteUrl)
    .replace(/\{niche\}/gi, niche);

  prompt += "\n\nRecipient Name: " + name + "\nRecipient Email: " + email;
  prompt += buildWebsiteContextBlock(data);
  prompt += HUMAN_TONE_INSTRUCTION;
  prompt += EMAIL_STRUCTURE_INSTRUCTION;
  prompt += ANTI_AI_PHRASES_INSTRUCTION;
  prompt += "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>";
  return prompt;
}

function buildColdOutreachPrompt(data) {
  const name = data.recipientName || "Recipient";
  const email = data.recipientEmail || "";
  const campaign = data.campaignName || "Outreach";
  const website = data.websiteUrl || data.website || "N/A";
  const step = data.step != null ? String(data.step) : "1";

  return (
    "Write a professional cold outreach email.\n\n" +
    "Recipient Name: " + name + "\nRecipient Email: " + email + "\nCampaign: " + campaign + "\nWebsite: " + website + "\nStep: " + step +
    buildWebsiteContextBlock(data) +
    HUMAN_TONE_INSTRUCTION +
    EMAIL_STRUCTURE_INSTRUCTION +
    ANTI_AI_PHRASES_INSTRUCTION +
    "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>"
  );
}

function buildGuestPostPrompt(data) {
  const name = data.recipientName || "Recipient";
  const email = data.recipientEmail || "";
  const websiteUrl = (data.websiteUrl || data.website || "").trim() || "the given website";
  const niche = (data.niche || "").trim() || "their niche";

  return (
    "Deeply browse this website: " + websiteUrl + " and write a short and personalized guest post request focusing on " + niche + ".\n\n" +
    "Recipient Name: " + name + "\nRecipient Email: " + email + "\n\n" +
    "Suggest one subject line and 3 content topics; include them in the email. Use bullet points for the topics.\n" +
    buildWebsiteContextBlock(data) +
    HUMAN_TONE_INSTRUCTION +
    EMAIL_STRUCTURE_INSTRUCTION +
    ANTI_AI_PHRASES_INSTRUCTION +
    "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>"
  );
}

// ─── Website scraper ──────────────────────────────────────────────────────────
// Fetches the lead's landing page and extracts title, meta description, and
// the first meaningful paragraph. Called from handleStartWorkflow before
// prompt generation. Runs in the service-worker context so fetch() has no CORS
// restrictions. Returns null on any failure (graceful degradation).
async function scrapeWebsiteContent(url) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let html;
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadsExtension/1.0)" },
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      html = await resp.text();
    } catch (_) {
      clearTimeout(timer);
      return null;
    }

    // Strip scripts and styles to avoid false matches
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");

    // Title
    const titleMatch = stripped.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Meta description (both attribute orderings)
    const metaMatch =
      stripped.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i) ||
      stripped.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i);
    const description = metaMatch ? metaMatch[1].trim() : "";

    // First body paragraph with meaningful content (30+ chars)
    const paraMatch = stripped.match(/<p[^>]*>([^<]{30,400})<\/p>/i);
    const firstPara = paraMatch
      ? paraMatch[1].replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim()
      : "";

    if (!title && !description && !firstPara) return null;
    return { title, description, firstPara };
  } catch (_) {
    return null;
  }
}

// ─── Popup state helper ───────────────────────────────────────────────────────
async function handleGetPopupState() {
  const s = bulkAutomationState;
  let dashboardUrl = "";
  let repliedCount = null;
  let todaySentCount = null;

  try {
    const base = await getApiBaseUrl();
    dashboardUrl = base + "/dashboard";

    // Fetch replied count and today's sent count from the server
    const statsResp = await fetch(base + "/api/popup-stats", {
      signal: AbortSignal.timeout(4000),
    });
    if (statsResp.ok) {
      const stats = await statsResp.json();
      repliedCount = stats.repliedCount ?? null;
      todaySentCount = stats.todaySentCount ?? null;
    }
  } catch (_) { /* non-fatal — popup still renders with session data */ }

  const queueRemaining = Math.max(0, (s.total || 0) - (s.processed || 0));

  return {
    success: true,
    status: s.status || "idle",
    phase: s.phase || "send",
    sent: s.sent || 0,
    followups: s.followups || 0,
    failed: s.failed || 0,
    processed: s.processed || 0,
    total: s.total || 0,
    queueRemaining,
    repliedCount,
    todaySentCount,
    dashboardUrl,
  };
}
