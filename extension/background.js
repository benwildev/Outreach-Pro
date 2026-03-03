/**
 * Service worker: orchestrates workflow between dashboard, ChatGPT, and Gmail.
 */
importScripts("utils.js");

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
});

async function handleStartWorkflow(data) {
  const prompt = buildPrompt(data);
  const tab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: true });
  await waitForTabReady(tab.id);
  await delay(2500);
  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: "pasteAndSend",
      prompt,
      recipientEmail: data.recipientEmail,
    });
  } catch (e) {
    console.error("[Leads Extension] Send message to ChatGPT tab failed:", e);
  }
  return { success: true, tabId: tab.id };
}

async function handleChatGptDone(data, chatTabId) {
  const { subject, body, recipientEmail } = data;
  const encodedTo = encodeURIComponent(recipientEmail || "");
  const encodedSu = encodeURIComponent(subject || "");
  // Do NOT put body in URL - it gets truncated. Content script will fill body.
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedTo}&su=${encodedSu}`;
  const tab = await chrome.tabs.create({ url: gmailUrl, active: true });
  await waitForTabReady(tab.id);
  await delay(2000);
  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: "fillAndSend",
      data: { to: recipientEmail || "", subject: subject || "", body: body || "" },
    });
  } catch (e) {
    console.error("[Leads Extension] Send message to Gmail tab failed:", e);
  }
  return { success: true };
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
