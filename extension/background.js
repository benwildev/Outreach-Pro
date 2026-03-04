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
  "- End with \"Best regards,\" only.\n" +
  "- Do not add any sender name or signature line unless that exact line already exists in the campaign template.\n" +
  "- Do not use placeholders such as [Your Name], {{topic}}, [Company Name], or bracketed template text anywhere in the final email.";

const ANTI_AI_PHRASES_INSTRUCTION =
  "\n\nAvoid these phrases unless the user explicitly wrote them in the campaign template:\n" +
  "- I hope you are doing well\n" +
  "- I have been reading through your site\n" +
  "- It is clear you focus on real value\n" +
  "- I would love to collaborate\n" +
  "- genuinely helps your audience\n" +
  "- well researched guest article";

// Reliability-first mode: keep automation tabs active so ChatGPT/Gmail UIs initialize fully.
const RUN_TABS_IN_BACKGROUND = false;
const REPLY_CHECK_ALARM = "dailyReplyCheck";
const REPLY_CHECK_PERIOD_MINUTES = 24 * 60;
const CHATGPT_HANDOFF_TIMEOUT_MS = 90000;
const CHATGPT_DEFAULT_URL = "https://chatgpt.com/";
const CAMPAIGN_CHAT_URLS_KEY = "campaignChatUrls";
let replySweepRunning = false;
const pendingWorkflows = new Map();

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
  runDailyReplySweep("alarm").catch((err) => {
    console.error("[Leads Extension Background] Daily reply sweep failed:", err);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startWorkflow") {
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
      chrome.tabs.remove(tabId).catch(() => {});
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
});

async function handleStartWorkflow(data) {
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
  console.log("[Leads Extension] Workflow started for lead:", data && data.leadId ? data.leadId : "(no lead id)");
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
    campaignBody: data.campaignBody || "",
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
    },
  }, 7, 900);
  if (!sentToGmail) {
    console.warn("[Leads Extension] Initial Gmail handoff failed, forcing active tab retry:", tab.id);
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await delay(1200);
    } catch (_) {
      // Ignore and retry anyway.
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
      },
    }, 10, 1000);
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
  return "https://mail.google.com/mail/u/" + encodeURIComponent(authUser);
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
    },
  }, 7, 900);

  if (!sentToGmail) {
    console.warn("[Leads Extension] Fallback Gmail handoff failed, forcing active tab retry:", tab.id);
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await delay(1200);
    } catch (_) {
      // Ignore and retry anyway.
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
      },
    }, 10, 1000);
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
    gmailUrl = gmailBaseUrl + "/#sent/" + tid;
    openReply = true;
  } else {
    // No thread ID: open new compose (e.g. first email was sent outside extension)
    const encodedTo = encodeURIComponent(to || "");
    const encodedSu = encodeURIComponent(subject || "");
    gmailUrl = gmailBaseUrl + "/#inbox?compose=new&to=" + encodedTo + "&su=" + encodedSu;
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
    "http://localhost:3000/api/reply-check-queue?limit=" + encodeURIComponent(String(maxLeads))
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
  replySweepRunning = true;

  try {
    const queue = await fetchReplyCheckQueue(30);
    let checked = 0;
    let marked = 0;

    for (let i = 0; i < queue.length; i++) {
      const lead = queue[i] || {};
      const leadId = lead.id ? String(lead.id) : "";
      const threadId = lead.gmailThreadId ? String(lead.gmailThreadId).trim() : "";
      const recipientEmail = lead.recipientEmail ? String(lead.recipientEmail).trim().toLowerCase() : "";
      const campaignGmailAuthUser = lead.campaignGmailAuthUser ? String(lead.campaignGmailAuthUser).trim() : "";

      if (!leadId || !threadId || !recipientEmail) {
        continue;
      }

      checked += 1;
      try {
        const result = await handleCheckReplyByThread({
          leadId: leadId,
          threadId: threadId,
          recipientEmail: recipientEmail,
          campaignGmailAuthUser: campaignGmailAuthUser,
        });
        if (result && result.success && result.replied) {
          marked += 1;
        }
      } catch (err) {
        console.warn("[Leads Extension Background] Reply check failed for lead", leadId, err);
      }
      await delay(900);
    }

    console.log(
      "[Leads Extension Background] Daily reply sweep completed:",
      "trigger=" + String(trigger || "unknown"),
      "checked=" + checked,
      "marked=" + marked
    );

    return { success: true, checked, marked };
  } finally {
    replySweepRunning = false;
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
  const gmailUrl = gmailBaseUrl + "/#all/" + encodeURIComponent(threadId);
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
    await handleMarkLeadReplied({ leadId: leadId });
  }

  return {
    success: true,
    replied: !!response.replied,
    senders: Array.isArray(response.senders) ? response.senders : [],
  };
}

async function handleMarkLeadReplied(data) {
  const baseUrl = "http://localhost:3000";
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

async function handleUpdateFollowup(data) {
  const baseUrl = "http://localhost:3000";
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
  if (updatedLead) {
    notifyDashboardTabs(updatedLead);
  }

  return { success: true, data: result };
}

async function handleUpdateLeadStatus(data) {
  const response = await fetch("http://localhost:3000/api/update-send", {
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
  if (updatedLead) {
    notifyDashboardTabs(updatedLead);
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
      if (i === Math.floor(attempts / 2)) {
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
    HUMAN_TONE_INSTRUCTION +
    EMAIL_STRUCTURE_INSTRUCTION +
    ANTI_AI_PHRASES_INSTRUCTION +
    "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>"
  );
}
