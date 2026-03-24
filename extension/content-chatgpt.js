/**
 * Content script: ChatGPT
 * Receives prompt from background, pastes into textarea, sends, waits for response, parses and returns to background.
 */

(function () {
  "use strict";

  const LOG_PREFIX = "[Leads Extension ChatGPT]";

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  let pendingPrompt = null;
  let pendingRecipientEmail = null;
  let pendingLeadId = null;
  let pendingCampaignId = null;
  let alreadyReportedError = false;

  function checkForLoadingError() {
    const text = document.body.innerText || "";
    if (text.includes("The conversation that you requested could not be loaded") ||
      text.includes("Conversation not found") ||
      text.includes("There was an error generating a response") && document.querySelectorAll('.markdown').length === 0) {
      return true;
    }
    return false;
  }

  function isPromptEchoText(text) {
    const value = String(text || "").toLowerCase();
    if (!value) return false;
    return (
      value.indexOf("return output exactly in this format") !== -1 ||
      value.indexOf("<single line subject>") !== -1 ||
      value.indexOf("<email body only>") !== -1
    );
  }

  function isPlaceholderOnlyValue(value, kind) {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return false;
    if (kind === "subject") {
      return /^<\s*single\s+line\s+subject\s*>$/.test(v);
    }
    if (kind === "body") {
      return /^<\s*email\s+body\s+only\s*>$/.test(v);
    }
    return false;
  }

  function templateHasSignatureBlock(template) {
    const text = String(template || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!text) return false;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "").trim();
      if (!/^(best|best regards|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/i.test(line)) {
        continue;
      }
      for (let j = i + 1; j < lines.length; j++) {
        if (String(lines[j] || "").trim()) {
          return true;
        }
      }
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== "pasteAndSend") return;

    sendResponse({ success: true, accepted: true });

    pendingPrompt = message.prompt;
    const recipientName = message.recipientName;
    pendingRecipientEmail = message.recipientEmail;
    pendingLeadId = message.leadId;
    pendingCampaignId = message.campaignId;
    alreadyReportedError = false;
    const campaignBodyText = message.campaignBody || "";
    const templateHasSignature = templateHasSignatureBlock(campaignBodyText);
    const signatureBlock = extractTemplateSignatureBlock(campaignBodyText);
    const campaignSignature = message.campaignSignature || "";
    runPasteAndSend(
      message.prompt,
      recipientName,
      message.recipientEmail,
      message.leadId,
      templateHasSignature,
      signatureBlock,
      campaignSignature
    )
      .then((result) => {
        pendingPrompt = null;
        pendingRecipientEmail = null;
        pendingLeadId = null;
        if (!result?.success) {
          logError("ChatGPT", "pasteAndSend failed:", result?.error || "Unknown error");
        }
      })
      .catch((err) => {
        logError("ChatGPT", err);
      });
  });

  async function runPasteAndSend(prompt, recipientName, recipientEmail, leadId, templateHasSignature, signatureBlock, campaignSignature) {
    log("ChatGPT", "pasteAndSend started, prompt length:", prompt?.length, "leadId:", leadId ? "***" : "");
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
      if (submitBtn) {
        submitBtn.click();
      } else {
        textarea.focus();
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      }
    }
    await delay(500);

    const responseText = await waitForResponse(240000);
    if (!responseText) return { success: false, error: "No response or timeout" };

    const parsed = parseEmailResponse(responseText);
    const fallbackSubject =
      parsed.subject ||
      "Quick guest post idea for your audience";
    const fallbackBody =
      parsed.body ||
      responseText ||
      "";
    const subject = fallbackSubject;
    const body = cleanEmailBody(fallbackBody, {
      recipientName,
      templateHasSignature,
      signatureBlock,
      campaignSignature,
    });

    if (isPlaceholderOnlyValue(subject, "subject") || isPlaceholderOnlyValue(body, "body")) {
      logError("ChatGPT", "Placeholder template output detected; skipping handoff to Gmail");
      return { success: false, error: "Model returned placeholder template text" };
    }

    log("ChatGPT", "Parsed subject length:", subject.length, "body length:", body.length);

    if (!subject || !body) {
      log("ChatGPT", "Using fallback parse result. Subject length:", subject.length, "Body length:", body.length);
    }

    let sentToBackground = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ack = await chrome.runtime.sendMessage({
          action: "chatgptDone",
          data: { subject, body, recipientEmail, leadId, templateHasSignature: !!templateHasSignature },
        });
        sentToBackground = !!(ack && ack.success);
        if (sentToBackground) {
          log("ChatGPT", "chatgptDone acknowledged by background (attempt " + attempt + ")");
          break;
        }
      } catch (err) {
        logError("ChatGPT", "chatgptDone send failed (attempt " + attempt + "):", err && err.message ? err.message : err);
      }
      await delay(700);
    }

    if (!sentToBackground) {
      return { success: false, error: "Could not hand off generated email to background workflow" };
    }

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
        if (checkForLoadingError() && !alreadyReportedError) {
          alreadyReportedError = true;
          logError("ChatGPT", "Detected loading error, notifying background");
          chrome.runtime.sendMessage({
            action: "chatgptLoadError",
            data: { campaignId: pendingCampaignId, leadId: pendingLeadId }
          }).catch(() => { });
          clearInterval(t);
          resolve(null);
          return;
        }
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
    function sanitizeExtractedText(raw) {
      const cleaned = String(raw || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((line) => {
          const v = String(line || "").trim();
          if (!v) return true;
          if (/window\.__oai_/i.test(v)) return false;
          if (/__oai_(?:logHTML|SSR_HTML|logTTI|SSR_TTI)/i.test(v)) return false;
          if (/requestAnimationFrame\s*\(/i.test(v)) return false;
          return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return cleaned;
    }

    function extractCleanText(node) {
      if (!node) return "";
      const clone = node.cloneNode(true);
      const noise = clone.querySelectorAll([
        'sup', 'button',
        '[class*="citation" i]', '[class*="source" i]', '[class*="reference" i]',
        'span.flex.items-center.justify-center',
        '.text-xs', '.rounded-full', '.rounded-md', '.bg-token-main-surface-secondary',
        '[contenteditable="false"]'
      ].join(', '));
      for (let j = 0; j < noise.length; j++) {
        const el = noise[j];
        if (el && el.parentNode) {
          // If the element is purely a tiny icon/pill, kill it completely
          // Sometimes ChatGPT nests actual good text inside rounded things if we are too broad, 
          // so we ensure we only completely kill short/pill-like noise or explicit buttons/citations.
          const isButtonOrCitation = el.tagName === 'BUTTON' || el.tagName === 'SUP' || (el.className && el.className.match(/citation|source|reference/i));
          const isShortText = (el.innerText || el.textContent || "").length < 40;
          if (isButtonOrCitation || isShortText || el.getAttribute("contenteditable") === "false") {
            el.parentNode.removeChild(el);
          }
        }
      }
      const links = clone.querySelectorAll('a');
      for (let j = 0; j < links.length; j++) {
        const textNode = document.createTextNode(links[j].innerText || links[j].textContent || "");
        if (links[j].parentNode) links[j].parentNode.replaceChild(textNode, links[j]);
      }
      let rawText = String(clone.innerText || clone.textContent || "").trim();
      // Also strip typical markdown patterns like [Immovario](https://...)
      rawText = rawText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      // Strip isolated domains/pills at the end of paragraphs that might have leaked through
      rawText = rawText.replace(/(?:^|\n)([ \t]*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[ \t]*)(?=\n|$)/g, ""); // Matches isolated domain names on their own line
      // Strip inline domains placed right before a newline (e.g. "...audience. immovario.com\n")
      rawText = rawText.replace(/\s+[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?=\n|$)/g, "");
      return rawText;
    }

    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (nodes.length > 0) {
      const last = nodes[nodes.length - 1];
      return sanitizeExtractedText(extractCleanText(last));
    }
    const prose = document.querySelectorAll(".markdown, [class*='prose'], [class*='message'], [class*='markdown']");
    for (let i = prose.length - 1; i >= 0; i--) {
      const t = sanitizeExtractedText(extractCleanText(prose[i]));
      if (t.length > 30) return t;
    }
    return "";
  }

  function waitForResponse(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      let lastText = "";
      let stableCount = 0;
      const softResolveAfterMs = 45000;

      function looksLikeEmailOutput(text) {
        if (!text || text.length < 40) return false;
        if (/(?:^|\n)\s*\*{0,2}subject\*{0,2}\s*[:\-]/i.test(text)) return true;
        if (/(?:^|\n)\s*\*{0,2}body\*{0,2}\s*[:\-]/i.test(text)) return true;
        if (/^hi\s+[^\n,]+,/im.test(text) && /(?:^|\n)\s*best(?: regards)?[,]?/im.test(text)) return true;
        return false;
      }

      const interval = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          const fallback = getLastAssistantText() || null;
          resolve(isPromptEchoText(fallback) ? null : fallback);
          return;
        }
        const generating = isStillGenerating();
        const text = getLastAssistantText();
        if (!text || isPromptEchoText(text)) {
          stableCount = 0;
          lastText = "";
          return;
        }
        const hasEmailShape = looksLikeEmailOutput(text);
        if (hasEmailShape) {
          if (text === lastText) {
            stableCount++;
            const elapsed = Date.now() - start;
            const stableNeeded = generating ? 4 : 2;
            if (stableCount >= stableNeeded || (elapsed >= softResolveAfterMs && stableCount >= 2)) {
              clearInterval(interval);
              resolve(text);
            }
          } else {
            lastText = text;
            stableCount = 0;
          }
        } else if (!generating && text.length > 120) {
          // Fallback when model ignores requested Subject/Body labels.
          if (text === lastText) {
            stableCount++;
            if (stableCount >= 3) {
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

  /**
   * Parse email response from ChatGPT
   * Looks for "Subject:" and "Body:" in the response text
   * Works even if ChatGPT returns extra instructions before the email
   */
  function parseEmailResponse(text) {
    if (!text || typeof text !== "string") {
      return { subject: "", body: "" };
    }

    const trimmed = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const subjectPatterns = [
      /(?:^|\n)\s*\*{0,2}subject\*{0,2}\s*:\s*(.+?)(?=\n|$)/i,
      /(?:^|\n)\s*subject\s*-\s*(.+?)(?=\n|$)/i,
      /(?:^|\n)\s*title\s*:\s*(.+?)(?=\n|$)/i
    ];
    let subject = "";
    for (let i = 0; i < subjectPatterns.length; i++) {
      const m = trimmed.match(subjectPatterns[i]);
      if (m && m[1]) {
        subject = m[1].replace(/[*_`]/g, "").trim();
        break;
      }
    }

    const bodyPatterns = [
      /(?:^|\n)\s*\*{0,2}body\*{0,2}\s*:\s*([\s\S]*)$/i,
      /(?:^|\n)\s*email\s*:\s*([\s\S]*)$/i
    ];
    let body = "";
    for (let i = 0; i < bodyPatterns.length; i++) {
      const m = trimmed.match(bodyPatterns[i]);
      if (m && m[1]) {
        body = m[1].trim();
        break;
      }
    }

    if (!body) {
      const lines = trimmed.split("\n").map((l) => l.trim());
      const filtered = lines.filter((line) => {
        if (!line) return false;
        return !/^\*{0,2}(subject|body)\*{0,2}\s*[:\-]/i.test(line);
      });
      body = filtered.join("\n").trim();
    }

    if (isPromptEchoText(body)) {
      body = body
        .replace(/return output exactly in this format:[\s\S]*$/i, "")
        .replace(/<\s*email body only\s*>/ig, "")
        .trim();
    }

    if (isPlaceholderOnlyValue(subject, "subject")) {
      subject = "";
    }
    if (isPlaceholderOnlyValue(body, "body")) {
      body = "";
    }

    if (!subject && body) {
      const firstLine = body.split("\n")[0].trim();
      if (firstLine && firstLine.length <= 120) {
        subject = firstLine.replace(/[*_`]/g, "").trim();
      }
    }

    log("ChatGPT", "Parsed email - Subject:", subject.substring(0, 50), "| Body length:", body.length);

    return { subject, body };
  }

  log("ChatGPT", "Content script loaded");
})();
