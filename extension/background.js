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
  "- Sign off with \"Best,\" or \"Best regards,\" followed by a simple signature line.\n" +
  "- Do not use placeholders such as [Your Name], {{topic}}, [Company Name], or bracketed template text anywhere in the final email.";

const ANTI_AI_PHRASES_INSTRUCTION =
  "\n\nAvoid these phrases unless the user explicitly wrote them in the campaign template:\n" +
  "- I hope you are doing well\n" +
  "- I have been reading through your site\n" +
  "- It is clear you focus on real value\n" +
  "- I would love to collaborate\n" +
  "- genuinely helps your audience\n" +
  "- well researched guest article";

// Keep extension automation from stealing focus while user is working.
const RUN_TABS_IN_BACKGROUND = true;
const REPLY_CHECK_ALARM = "dailyReplyCheck";
const REPLY_CHECK_PERIOD_MINUTES = 24 * 60;
let replySweepRunning = false;

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
});

async function handleStartWorkflow(data) {
  const prompt = buildPrompt(data);
  const tab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(2500);
  const sent = await sendMessageToTabWithRetry(tab.id, {
    action: "pasteAndSend",
    prompt,
    recipientName: data.recipientName,
    recipientEmail: data.recipientEmail,
    leadId: data.leadId,
  }, 5, 700);
  if (!sent) {
    console.error("[Leads Extension] Send message to ChatGPT tab failed after retries");
  }
  return { success: true, tabId: tab.id };
}

async function handleChatGptDone(data, chatTabId) {
  const { subject, body, recipientEmail, leadId } = data;
  const customSignature = await getCustomSignatureSetting();
  const encodedTo = encodeURIComponent(recipientEmail || "");
  const encodedSu = encodeURIComponent(subject || "");
  // Open Gmail compose in the normal inbox context so Gmail does not exit a standalone compose route after send.
  // Do NOT put body in URL - it gets truncated. Content script will fill body.
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox?compose=new&to=${encodedTo}&su=${encodedSu}`;
  const tab = await chrome.tabs.create({ url: gmailUrl, active: !RUN_TABS_IN_BACKGROUND });
  await waitForTabReady(tab.id);
  await delay(2000);
  const sentToGmail = await sendMessageToTabWithRetry(tab.id, {
    action: "fillAndSend",
    data: {
      to: recipientEmail || "",
      subject: subject || "",
      body: body || "",
      customSignature: customSignature || "",
      leadId: leadId || "",
      isFollowup: false,
      autoSend: true,
    },
  }, 7, 900);
  if (!sentToGmail) {
    console.error("[Leads Extension] Send message to Gmail tab failed after retries");
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

async function handleStartFollowupWorkflow(data) {
  const { to, subject, body, leadId, threadId } = data;
  const customSignature = await getCustomSignatureSetting();
  let gmailUrl;
  let openReply = false;
  const tid = threadId ? String(threadId).trim().replace(/^#+/, "") : "";
  if (tid) {
    // Try opening the thread first (works with alphanumeric ID; numeric may show "no longer exists").
    gmailUrl = "https://mail.google.com/mail/u/0/#sent/" + tid;
    openReply = true;
  } else {
    // No thread ID: open new compose (e.g. first email was sent outside extension)
    const encodedTo = encodeURIComponent(to || "");
    const encodedSu = encodeURIComponent(subject || "");
    gmailUrl = "https://mail.google.com/mail/u/0/#inbox?compose=new&to=" + encodedTo + "&su=" + encodedSu;
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

      if (!leadId || !threadId || !recipientEmail) {
        continue;
      }

      checked += 1;
      try {
        const result = await handleCheckReplyByThread({
          leadId: leadId,
          threadId: threadId,
          recipientEmail: recipientEmail,
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

  if (!threadId || !recipientEmail) {
    return { success: false, error: "threadId and recipientEmail are required" };
  }

  const gmailUrl = "https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(threadId);
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
  for (let i = 0; i < attempts; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch (_) {
      await delay(delayMs || 600);
    }
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
