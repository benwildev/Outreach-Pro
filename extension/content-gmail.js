/**
 * Content script: Gmail
 * Fills compose window (To, Subject, Body) and optionally clicks Send.
 * Uses contenteditable div[aria-label="Message Body"] and execCommand("insertHTML").
 */

(function () {
  "use strict";

  const LOG_PREFIX = "[Gmail Extension]";

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "clickSend") {
      clickGmailSend()
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          logError("clickSend failed", err);
          sendResponse({ success: false, error: String(err && err.message) });
        });
      return true;
    }
    if (message.action === "fillAndSend") {
      fillAndSend(message.data)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          logError("fillAndSend failed", err);
          sendResponse({ success: false, error: String(err && err.message) });
        });
      return true;
    }
  });

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Wait for an element to appear (polling). Searches document and same-origin iframes.
   * @param {string} selector - CSS selector (e.g. 'div[aria-label="Message Body"]')
   * @param {Object} options - { timeoutMs, pollIntervalMs, rootDocument }
   * @returns {Promise<{ el: Element, doc: Document }|null>}
   */
  async function waitForElement(selector, options = {}) {
    const timeoutMs = options.timeoutMs ?? 15000;
    const pollIntervalMs = options.pollIntervalMs ?? 300;
    const rootDoc = options.rootDocument ?? document;
    const start = Date.now();

    function findInDoc(doc, depth = 0) {
      if (depth > 6) return null;
      try {
        const el = doc.querySelector(selector);
        if (el && el.offsetParent !== null) return { el, doc };
        const iframes = doc.querySelectorAll("iframe");
        for (const frame of iframes) {
          try {
            const subDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
            if (subDoc && subDoc.body) {
              const out = findInDoc(subDoc, depth + 1);
              if (out) return out;
            }
          } catch (_) {}
        }
        const all = doc.querySelectorAll("*");
        for (const node of all) {
          if (node.shadowRoot) {
            const el = node.shadowRoot.querySelector(selector);
            if (el && el.offsetParent !== null) return { el, doc: node.shadowRoot };
            const out = findInDoc(node.shadowRoot, depth + 1);
            if (out) return out;
          }
        }
      } catch (_) {}
      return null;
    }

    while (Date.now() - start < timeoutMs) {
      const result = findInDoc(rootDoc);
      if (result) {
        log("waitForElement found", selector);
        return result;
      }
      await delay(pollIntervalMs);
    }
    log("waitForElement timeout", selector, "after", timeoutMs, "ms");
    return null;
  }

  /**
   * Wait for Gmail compose body: div[aria-label="Message Body"].
   * @returns {Promise<{ el: Element, doc: Document }|null>}
   */
  async function waitForComposeBody() {
    const bodySelector = 'div[aria-label="Message Body"]';
    return waitForElement(bodySelector, { timeoutMs: 12000, pollIntervalMs: 400 });
  }

  /**
   * Escape only &, <, > for safe HTML content (no over-escaping).
   */
  function escapeMinimal(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Convert plain-text email body to Gmail compose structure:
   * - Split by double newline (\n\n) into paragraphs
   * - Each paragraph → <div>content</div> (single \n inside → <br>)
   * - Between paragraphs → <div><br></div>
   */
  function formatEmailForGmail(text) {
    if (!text || typeof text !== "string") return "";
    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!s) return "";
    const paragraphs = s.split(/\n\n+/);
    const parts = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (para === "") continue;
      const escaped = escapeMinimal(para);
      const withBr = escaped.replace(/\n/g, "<br>");
      parts.push("<div>" + withBr + "</div>");
      if (i < paragraphs.length - 1) {
        parts.push("<div><br></div>");
      }
    }
    return parts.join("");
  }

  /**
   * Insert formatted HTML into the compose body via Selection/Range so Gmail does not rewrite it.
   * No innerHTML assignment; uses execCommand("insertHTML") or fragment fallback.
   */
  function insertBodyContent(bodyEl, formattedHtml, doc) {
    const d = doc || bodyEl.ownerDocument || document;
    const win = d.defaultView || window;

    bodyEl.focus();

    const selection = win.getSelection();
    const range = d.createRange();
    range.selectNodeContents(bodyEl);
    range.deleteContents();

    try {
      selection.removeAllRanges();
      selection.addRange(range);
      d.execCommand("insertHTML", false, formattedHtml);
      log("Body inserted via execCommand");
    } catch (e) {
      log("execCommand failed, using fragment", e);
      const temp = d.createElement("div");
      temp.innerHTML = formattedHtml;
      const fragment = d.createDocumentFragment();
      while (temp.firstChild) {
        fragment.appendChild(temp.firstChild);
      }
      range.insertNode(fragment);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    bodyEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
    log("Body input event dispatched");
  }

  /**
   * Find subject input: input[name="subjectbox"] (Gmail) or fallbacks.
   */
  function findSubjectInput(doc = document) {
    const sel = doc.querySelector('input[name="subjectbox"]')
      || doc.querySelector('input[aria-label="Subject"]')
      || doc.querySelector('input[placeholder*="Subject"]')
      || doc.querySelector('input[name="subject"]');
    return sel || null;
  }

  /**
   * Find To input.
   */
  function findToInput(doc = document) {
    return doc.querySelector('input[aria-label="To"]')
      || doc.querySelector('input[placeholder*="Recipients"]')
      || doc.querySelector('input[name="to"]')
      || null;
  }

  async function clickGmailSend() {
    await delay(800);
    const sendSelectors = [
      'div[role="button"][data-tooltip="Send"]',
      'div[data-tooltip="Send"]',
      '[aria-label="Send"]',
      'div[gh="cm"] div[role="button"]',
      '.T-I-KE',
    ];
    for (const sel of sendSelectors) {
      const btn = document.querySelector(sel);
      if (btn && (btn.textContent || "").toLowerCase().includes("send")) {
        btn.click();
        log("Send button clicked");
        return;
      }
    }
    const allButtons = document.querySelectorAll('div[role="button"], [role="button"]');
    for (const btn of allButtons) {
      const label = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
      if (label === "send" || (label.includes("send") && label.length < 15)) {
        btn.click();
        log("Send clicked via fallback");
        return;
      }
    }
    log("Send button not found; user may click manually");
  }

  async function fillAndSend(data) {
    const to = (data && data.to) ? String(data.to).trim() : "";
    const subject = (data && data.subject) ? String(data.subject).trim() : "";
    const body = (data && data.body) ? String(data.body).trim() : "";

    log("fillAndSend started", { to: to ? "***" : "", subject: subject ? "***" : "", bodyLength: body.length });

    await delay(1500);

    const bodyResult = await waitForComposeBody();
    const searchDoc = bodyResult ? bodyResult.doc : document;

    const toInput = findToInput(searchDoc);
    if (toInput && to) {
      toInput.focus();
      toInput.value = to;
      toInput.dispatchEvent(new Event("input", { bubbles: true }));
      toInput.dispatchEvent(new Event("change", { bubbles: true }));
      log("To field filled");
      await delay(200);
    } else if (to && !toInput) {
      log("To input not found");
    }

    const subjInput = findSubjectInput(searchDoc);
    if (subjInput && subject) {
      subjInput.focus();
      subjInput.value = subject;
      subjInput.dispatchEvent(new Event("input", { bubbles: true }));
      subjInput.dispatchEvent(new Event("change", { bubbles: true }));
      log("Subject field filled");
      await delay(200);
    } else if (subject && !subjInput) {
      log("Subject input not found");
    }

    if (!bodyResult) {
      log("Compose body not found after wait");
      await clickGmailSend();
      return;
    }

    const { el: bodyEl, doc: bodyDoc } = bodyResult;

    if (body) {
      const formattedBody = formatEmailForGmail(body);
      log("Inserting body, formatted length:", formattedBody.length);
      insertBodyContent(bodyEl, formattedBody, bodyDoc);
      await delay(500);
    }

    await clickGmailSend();
    log("fillAndSend completed");
  }

  log("Content script loaded");
})();
