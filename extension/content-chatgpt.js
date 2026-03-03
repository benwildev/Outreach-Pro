/**
 * Content script: ChatGPT
 * Receives prompt from background, pastes into textarea, sends, waits for response, parses and returns to background.
 */

(function () {
  "use strict";

  let pendingPrompt = null;
  let pendingRecipientEmail = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== "pasteAndSend") return;
    pendingPrompt = message.prompt;
    pendingRecipientEmail = message.recipientEmail;
    runPasteAndSend(message.prompt, message.recipientEmail)
      .then((result) => {
        pendingPrompt = null;
        pendingRecipientEmail = null;
        sendResponse(result);
      })
      .catch((err) => {
        logError("ChatGPT", err);
        sendResponse({ success: false, error: String(err.message) });
      });
    return true;
  });

  async function runPasteAndSend(prompt, recipientEmail) {
    log("ChatGPT", "pasteAndSend started, prompt length:", prompt?.length);
    const textarea = await waitForSelector('textarea[data-id="root"], textarea, [contenteditable="true"]', 20000);
    if (!textarea) {
      log("ChatGPT", "Could not find input field");
      return { success: false, error: "Could not find input" };
    }
    log("ChatGPT", "Input found, pasting prompt");

    setText(textarea, prompt);
    await delay(400);
    dispatchInputEvents(textarea);
    await delay(300);

    const sendBtn = document.querySelector('button[data-testid="send-button"]')
      || document.querySelector('button[aria-label="Send message"]')
      || Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute("aria-label") || "").toLowerCase().includes("send"));
    if (sendBtn) {
      sendBtn.click();
      log("ChatGPT", "Send clicked");
    } else {
      const submitBtn = document.querySelector('form button[type="submit"]') || document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    }
    await delay(500);

    const responseText = await waitForResponse(120000);
    if (!responseText) return { success: false, error: "No response or timeout" };

    const { subject, body } = parseEmailResponse(responseText);
    log("ChatGPT", "Parsed subject length:", subject.length, "body length:", body.length);

    chrome.runtime.sendMessage({
      action: "chatgptDone",
      data: { subject, body, recipientEmail },
    });
    return { success: true, subject, body };
  }

  function setText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.isContentEditable) {
      el.focus();
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      } catch (_) {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      return;
    }
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  }

  function dispatchInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function waitForSelector(selector, timeoutMs) {
    return new Promise((resolve) => {
      const tryFind = () => {
        const byPlaceholder = document.querySelector('textarea[placeholder*="Ask"], textarea[placeholder*="anything"], textarea[placeholder*="Message"]');
        if (byPlaceholder && byPlaceholder.offsetParent !== null) return byPlaceholder;
        const textareas = document.querySelectorAll("textarea");
        for (const ta of textareas) {
          if (ta.offsetParent !== null && ta.offsetHeight > 40) return ta;
          if (ta.offsetParent !== null) return ta;
        }
        const editables = document.querySelectorAll('[contenteditable="true"]');
        for (const ed of editables) {
          if (ed.offsetParent !== null && ed.offsetHeight > 50) return ed;
          if (ed.offsetParent !== null && (ed.getAttribute("role") === "textbox" || ed.querySelector("br"))) return ed;
        }
        const bySel = document.querySelector(selector);
        if (bySel) return bySel;
        return null;
      };
      const found = tryFind();
      if (found) return resolve(found);
      const end = Date.now() + timeoutMs;
      const t = setInterval(() => {
        const el = tryFind();
        if (el) {
          clearInterval(t);
          resolve(el);
        } else if (Date.now() > end) {
          clearInterval(t);
          resolve(null);
        }
      }, 300);
    });
  }

  function isStillGenerating() {
    const stopBtn = document.querySelector('button[aria-label="Stop generating"]');
    if (stopBtn && stopBtn.offsetParent !== null) return true;
    const buttons = document.querySelectorAll("button");
    for (const b of buttons) {
      if ((b.textContent || "").trim() === "Stop generating") return true;
    }
    return false;
  }

  function getLastAssistantText() {
    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (nodes.length > 0) {
      const last = nodes[nodes.length - 1];
      return (last.textContent || "").trim();
    }
    const prose = document.querySelectorAll(".markdown, [class*='prose'], [class*='message'], [class*='markdown']");
    for (let i = prose.length - 1; i >= 0; i--) {
      const t = (prose[i].textContent || "").trim();
      if (t.length > 30) return t;
    }
    return "";
  }

  function waitForResponse(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      let lastText = "";
      let stableCount = 0;
      const interval = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(getLastAssistantText() || null);
          return;
        }
        const generating = isStillGenerating();
        const text = getLastAssistantText();
        if (!generating && text.length > 50 && (text.includes("Subject:") || text.includes("Body:"))) {
          if (text === lastText) {
            stableCount++;
            if (stableCount >= 2) {
              clearInterval(interval);
              resolve(text);
            }
          } else {
            lastText = text;
            stableCount = 0;
          }
        }
      }, 1000);
    });
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  log("ChatGPT", "Content script loaded");
})();
