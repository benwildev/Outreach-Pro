/**
 * Content script: Gmail
 * Fills compose window (To, Subject, Body) and leaves the draft open.
 */

(function () {
  "use strict";

  const SCRIPT_VERSION = "gmail-content-2026-03-04-signaturefix-v12";
  const LOG_PREFIX = "[Gmail Extension]";
  let LAST_KNOWN_SIGNATURE_HTML = "";

  function log() {
    const args = Array.from(arguments);
    console.log(LOG_PREFIX, ...args);
  }

  function logError() {
    const args = Array.from(arguments);
    console.error(LOG_PREFIX, ...args);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fillAndSend") {
      sendResponse({ success: true, accepted: true });
      fillAndSend(message.data).catch((err) => {
        logError("fillAndSend error:", err.message);
      });
      return;
    }

    if (message.action === "checkThreadReply") {
      checkThreadReply(message.data)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((err) => {
          logError("checkThreadReply error:", err.message);
          sendResponse({ success: false, error: err.message || "Reply check failed" });
        });
      return true;
    }
  });

  function delay(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normalizeEmailValue(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getComposeRoots(doc) {
    const doc2 = doc || document;
    const roots = Array.from(doc2.querySelectorAll('div[role="dialog"]')).filter(function(root) {
      if (!root || root.offsetParent === null) return false;
      return !!root.querySelector('div[aria-label="Message Body"], div[contenteditable="true"][role="textbox"], div[contenteditable="true"][g_editable="true"], input[name="subjectbox"], div[aria-label*="To recipients"], input[name="to"]');
    });
    return roots;
  }

  function findBodyElements(root) {
    const scope = root || document;
    const selectors = [
      'div[aria-label="Message Body"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][g_editable="true"]',
      'div[contenteditable="true"][aria-label*="Message"]',
      'div.Am.Al.editable[contenteditable="true"]',
      'div.editable[contenteditable="true"]'
    ];
    const out = [];
    for (let i = 0; i < selectors.length; i++) {
      const nodes = scope.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        if (!node || node.offsetParent === null) {
          continue;
        }
        if (out.indexOf(node) === -1) {
          out.push(node);
        }
      }
    }
    return out;
  }

  function countVisibleBodyEditors() {
    return findBodyElements(document).length;
  }

  function findInlineComposeRoot() {
    const bodies = findBodyElements(document);
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (!body || body.offsetParent === null) {
        continue;
      }
      const root =
        body.closest('div[role="dialog"]') ||
        body.closest('div[aria-label*="Message"]') ||
        body.closest("form") ||
        body.parentElement;
      if (root) {
        return root;
      }
    }
    return null;
  }

  function findBodyElement(composeRoot) {
    const inRoot = composeRoot ? findBodyElements(composeRoot) : [];
    if (inRoot.length > 0) {
      return inRoot[0];
    }
    const global = findBodyElements(document);
    return global.length > 0 ? global[0] : null;
  }

  async function waitForBodyElement(timeoutMs, composeRoot) {
    const timeout = timeoutMs || 12000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = findBodyElement(composeRoot || null);
      if (el) {
        return el;
      }
      await delay(250);
    }
    return null;
  }

  function hasRecipientInComposeRoot(composeRoot, email) {
    if (!composeRoot || !email) {
      return false;
    }
    const expected = normalizeEmailValue(email);
    if (!expected) {
      return false;
    }

    const chipSelectors = [
      "[data-hovercard-id]",
      "[email]",
      "span[aria-label*='@']",
      "div[aria-label*='@']"
    ];
    for (let i = 0; i < chipSelectors.length; i++) {
      const nodes = composeRoot.querySelectorAll(chipSelectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        const candidates = [
          node.getAttribute("data-hovercard-id") || "",
          node.getAttribute("email") || "",
          node.getAttribute("aria-label") || "",
          node.textContent || ""
        ];
        for (let k = 0; k < candidates.length; k++) {
          const v = normalizeEmailValue(candidates[k]);
          if (v && (v === expected || v.indexOf(expected) !== -1)) {
            return true;
          }
        }
      }
    }

    const toRegion = composeRoot.querySelector('div[aria-label*="To recipients"], div[aria-label*="Recipients"], .aoD');
    const regionText = normalizeEmailValue(toRegion ? (toRegion.textContent || "") : "");
    if (regionText && regionText.indexOf(expected) !== -1) {
      return true;
    }

    return false;
  }

  function pickComposeRoot(email, subject) {
    const roots = getComposeRoots(document);
    if (roots.length === 0) {
      return findInlineComposeRoot();
    }

    const expectedEmail = normalizeEmailValue(email);
    const expectedSubject = String(subject || "").trim().toLowerCase();
    let best = roots[roots.length - 1];
    let bestScore = -1;

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      let score = i; // prefer later dialogs when tied

      if (document.activeElement && root.contains(document.activeElement)) {
        score += 6;
      }

      if (expectedEmail && hasRecipientInComposeRoot(root, expectedEmail)) {
        score += 12;
      }

      const toInRoot = findToInput(document, root);
      if (toInRoot) {
        score += 4;
      }

      const subjectInRoot = findSubjectInput(document, root);
      if (subjectInRoot && expectedSubject) {
        const subjValue = String(subjectInRoot.value || "").trim().toLowerCase();
        if (subjValue && (subjValue === expectedSubject || expectedSubject.indexOf(subjValue) !== -1 || subjValue.indexOf(expectedSubject) !== -1)) {
          score += 5;
        }
      }

      if (score >= bestScore) {
        bestScore = score;
        best = root;
      }
    }

    return best;
  }

  function findToInput(doc, composeRoot) {
    const doc2 = doc || document;

    const composeRoots = composeRoot ? [composeRoot] : getComposeRoots(doc2);

    const selectors = [
      'input[aria-label="To"]',
      'input[aria-label*="To recipients"]',
      'input[aria-label*="Recipients"]',
      'input[peoplekit-id]',
      'input[placeholder*="Recipients"]',
      'input[name="to"]',
      'div[aria-label*="To recipients"] input',
      'div[aria-label*="Recipients"] input'
    ];

    for (let i = 0; i < composeRoots.length; i++) {
      const root = composeRoots[i];
      for (let j = 0; j < selectors.length; j++) {
        const el = root.querySelector(selectors[j]);
        if (el && el.offsetParent !== null) {
          return el;
        }
      }
    }

    if (!composeRoot) {
      for (let i = 0; i < selectors.length; i++) {
        const el = doc2.querySelector(selectors[i]);
        if (el && el.offsetParent !== null) {
          return el;
        }
      }
    }

    return null;
  }

  function findSubjectInput(doc, composeRoot) {
    const doc2 = doc || document;
    const composeRoots = composeRoot ? [composeRoot] : Array.from(doc2.querySelectorAll('div[role="dialog"]')).filter(function(root) {
      return root && root.offsetParent !== null;
    });
    for (let i = 0; i < composeRoots.length; i++) {
      const root = composeRoots[i];
      const el = root.querySelector('input[name="subjectbox"]')
        || root.querySelector('input[aria-label="Subject"]')
        || root.querySelector('input[placeholder*="Subject"]');
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    if (!composeRoot) {
      return doc2.querySelector('input[name="subjectbox"]')
        || doc2.querySelector('input[aria-label="Subject"]')
        || doc2.querySelector('input[placeholder*="Subject"]');
    }
    return null;
  }

  async function waitForElement(selector, timeoutMs, composeRoot) {
    const timeout = timeoutMs || 15000;
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const el = composeRoot
        ? composeRoot.querySelector(selector)
        : document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        return el;
      }
      await delay(300);
    }
    
    return null;
  }

  async function waitForToInput(timeoutMs, composeRoot) {
    const timeout = timeoutMs || 10000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const el = findToInput(document, composeRoot || null);
      if (el && el.offsetParent !== null) {
        return el;
      }
      await delay(250);
    }

    return null;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeBodyForRendering(text) {
    let normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!normalized) {
      return "";
    }

    normalized = normalized.replace(/^(Hi\s+[^\n,]+,)\n(?!\n)/i, "$1\n\n");
    normalized = normalized.replace(/^(Hello\s+[^\n,]+,)\n(?!\n)/i, "$1\n\n");

    const lines = normalized.split("\n");
    const output = [];
    let autoListMode = false;
    let bufferedList = [];

    function flushBufferedList(insertGapAfterList) {
      if (bufferedList.length > 0) {
        for (let i = 0; i < bufferedList.length; i++) {
          output.push("- " + bufferedList[i]);
        }
        bufferedList = [];
      }
      if (insertGapAfterList && output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      autoListMode = false;
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (!line) {
        if (autoListMode) {
          continue;
        }
        if (output.length > 0 && output[output.length - 1] !== "") {
          output.push("");
        }
        continue;
      }

      if (/^\s*[-*•]\s+/.test(rawLine)) {
        flushBufferedList(false);
        output.push(line.replace(/^\s*[-*•]\s+/, "- "));
        continue;
      }

      if (/:\s*$/.test(line) && /(angles|ideas|topics|options|can cover|fit your audience)/i.test(line)) {
        flushBufferedList(false);
        output.push(line);
        autoListMode = true;
        continue;
      }

      if (autoListMode) {
        if (/^(if |thanks|thank you|best|regards|sincerely|let me know)/i.test(line)) {
          flushBufferedList(true);
          output.push(line);
          continue;
        }
        bufferedList.push(line);
        continue;
      }

      output.push(line);
    }

    flushBufferedList(false);

    // If AI returns single-line "paragraphs" separated by one newline,
    // expand them to blank-line-separated paragraphs for Gmail compose readability.
    const expanded = [];
    for (let i = 0; i < output.length; i++) {
      const current = output[i];
      expanded.push(current);
      if (!current) {
        continue;
      }

      const next = output[i + 1];
      if (!next) {
        continue;
      }

      const currentTrim = current.trim();
      const nextTrim = next.trim();
      const currentIsBullet = /^-\s+/.test(currentTrim);
      const nextIsBullet = /^-\s+/.test(nextTrim);
      const currentLooksHeading = /:\s*$/.test(currentTrim);
      const nextLooksClosing = /^(if |thanks|thank you|best|regards|sincerely|let me know)/i.test(nextTrim);

      if (!currentIsBullet && !nextIsBullet && !currentLooksHeading && !nextLooksClosing) {
        expanded.push("");
      }
    }

    return expanded.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function isSignoffLine(line) {
    const value = String(line || "").trim().toLowerCase();
    if (!value) {
      return false;
    }
    return /^(best|best regards|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/.test(value);
  }

  function looksLikeSignatureNameLine(line) {
    const value = String(line || "").trim();
    if (!value) {
      return false;
    }
    if (value.length > 48) {
      return false;
    }
    if (/[.!?:]/.test(value)) {
      return false;
    }
    if (/@|https?:\/\//i.test(value)) {
      return false;
    }
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) {
      return false;
    }
    return /^[A-Za-z][A-Za-z0-9 .'-]*$/.test(value);
  }

  function removeTrailingNameAfterSignoff(text, hasGmailSignature) {
    const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!hasGmailSignature) {
      return raw;
    }

    const lines = raw.split("\n");
    let end = lines.length - 1;
    while (end >= 0 && !String(lines[end] || "").trim()) {
      end -= 1;
    }
    if (end < 0) {
      return raw;
    }

    let signoffIndex = -1;
    for (let i = end; i >= 0; i--) {
      const line = String(lines[i] || "").trim();
      if (!line) {
        continue;
      }
      if (isSignoffLine(line)) {
        signoffIndex = i;
        break;
      }
      // Stop scanning once we hit non-signoff closing text.
      if (end - i > 6) {
        break;
      }
    }

    if (signoffIndex === -1) {
      return raw;
    }

    let hasNameLines = false;
    for (let i = signoffIndex + 1; i <= end; i++) {
      const line = String(lines[i] || "").trim();
      if (!line) {
        continue;
      }
      if (!looksLikeSignatureNameLine(line)) {
        return raw;
      }
      hasNameLines = true;
    }

    if (!hasNameLines) {
      return raw;
    }

    const trimmed = lines.slice(0, signoffIndex + 1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return trimmed;
  }

  function formatBody(text) {
    if (!text) return "";
    
    let normalized = normalizeBodyForRendering(text);
    
    // Split into paragraphs (separated by blank lines)
    const paragraphs = normalized.split(/\n\n+/);
    const parts = [];
    
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) continue;
      
      const lines = para.split("\n");
      let hasOpenList = false;
      let hasOpenParagraph = false;

      function openParagraph() {
        if (!hasOpenParagraph) {
          parts.push('<div style="margin: 0 0 12px 0;">');
          hasOpenParagraph = true;
        }
      }

      function closeParagraph() {
        if (hasOpenParagraph) {
          parts.push("</div>");
          hasOpenParagraph = false;
        }
      }

      function openList() {
        if (!hasOpenList) {
          parts.push('<div style="margin: 12px 0;"><ul style="margin: 0; padding-left: 22px;">');
          hasOpenList = true;
        }
      }

      function closeList() {
        if (hasOpenList) {
          parts.push("</ul></div>");
          hasOpenList = false;
        }
      }

      for (let j = 0; j < lines.length; j++) {
        const line = lines[j].trim();
        if (!line) {
          continue;
        }

        if (/^\s*[-*•]\s/.test(line)) {
          closeParagraph();
          openList();
          const itemText = line.replace(/^\s*[-*•]\s/, "");
          parts.push('<li style="margin: 0 0 8px 0;">' + escapeHtml(itemText) + "</li>");
          continue;
        }

        closeList();
        openParagraph();
        parts.push("<div>" + escapeHtml(line) + "</div>");
      }

      closeParagraph();
      closeList();

      // Keep one empty line between top-level paragraphs/sections.
      if (i < paragraphs.length - 1) {
        parts.push("<div><br></div>");
      }
    }
    
    return parts.join("");
  }

  function formatCustomSignatureHtml(signatureText) {
    const normalized = String(signatureText || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
    if (!normalized) {
      return "";
    }

    const lines = normalized.split("\n");
    const parts = ['<div class="gmail_signature" data-extension-signature="true">'];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        parts.push("<div><br></div>");
      } else {
        parts.push("<div>" + escapeHtml(line) + "</div>");
      }
    }
    parts.push("</div>");
    return parts.join("");
  }

  function setInputValue(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isWritableRecipientTarget(node) {
    if (!node) {
      return false;
    }
    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
      return true;
    }
    return !!node.isContentEditable;
  }

  function writeRecipientValue(node, value) {
    if (!node || !isWritableRecipientTarget(node)) {
      return false;
    }

    node.focus();
    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
      setInputValue(node, value);
      return true;
    }

    try {
      node.textContent = "";
      document.execCommand("insertText", false, value);
    } catch (_) {
      node.textContent = value;
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function focusRecipientsArea(composeRoot) {
    if (!composeRoot) {
      return false;
    }

    const selectors = [
      'div[aria-label*="To recipients"]',
      'div[aria-label*="Recipients"]',
      'span[email]',
      'div.aoD'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const el = composeRoot.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) {
        try {
          el.click();
          return true;
        } catch (_) {
          // Ignore and continue.
        }
      }
    }
    return false;
  }

  function findRecipientEditableTarget(composeRoot) {
    if (!composeRoot) {
      return null;
    }
    const selectors = [
      'input[aria-label*="To recipients"]',
      'input[aria-label*="Recipients"]',
      'input[aria-label*="recipient" i]',
      'textarea[aria-label*="recipient" i]',
      'input[peoplekit-id]',
      'input[name="to"]',
      'div[aria-label*="To recipients"] input',
      'div[aria-label*="Recipients"] input',
      'div[role="combobox"] input',
      'div[role="combobox"][contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="recipient" i]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const node = composeRoot.querySelector(selectors[i]);
      if (node && isWritableRecipientTarget(node)) {
        return node;
      }
    }

    return null;
  }

  async function tryFillRecipientViaActiveTarget(email, composeRoot) {
    const expected = normalizeEmailValue(email);
    if (!expected || !composeRoot) {
      return false;
    }

    focusRecipientsArea(composeRoot);
    await delay(220);

    let target = document.activeElement;
    if (!target || !composeRoot.contains(target) || !isWritableRecipientTarget(target)) {
      target = findRecipientEditableTarget(composeRoot);
    }
    if (!target) {
      return false;
    }

    const wrote = writeRecipientValue(target, expected);
    if (!wrote) {
      return false;
    }

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    target.dispatchEvent(new Event("blur", { bubbles: true }));

    await delay(350);
    if (hasRecipientInComposeRoot(composeRoot, expected)) {
      return true;
    }

    const maybeValue = normalizeEmailValue(target.value || target.textContent || "");
    return maybeValue.indexOf(expected) !== -1;
  }

  async function setRecipientValue(email, composeRoot) {
    const expected = String(email || "").trim().toLowerCase();
    if (!expected) {
      return { filled: false, composeRoot: composeRoot || null };
    }

    let targetRoot = composeRoot || null;
    if (targetRoot && hasRecipientInComposeRoot(targetRoot, expected)) {
      return { filled: true, composeRoot: targetRoot };
    }

    let toInput = await waitForToInput(5000, targetRoot || null);
    if (!toInput && targetRoot) {
      focusRecipientsArea(targetRoot);
      await delay(250);
      toInput = await waitForToInput(5000, targetRoot);
    }
    if (!toInput) {
      toInput = await waitForToInput(4000, null);
    }
    if (!toInput) {
      const activeFill = await tryFillRecipientViaActiveTarget(expected, targetRoot || composeRoot || null);
      if (activeFill) {
        return { filled: true, composeRoot: targetRoot || composeRoot || null };
      }
      return { filled: false, composeRoot: targetRoot };
    }

    const ownerRoot =
      toInput.closest('div[role="dialog"]') ||
      toInput.closest("form") ||
      toInput.closest('div[aria-label*="Message"]') ||
      targetRoot;
    if (ownerRoot) {
      targetRoot = ownerRoot;
    }

    setInputValue(toInput, expected);

    // Gmail compose often needs Enter to convert typed text into a recipient chip.
    toInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    toInput.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", bubbles: true }));
    toInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    toInput.dispatchEvent(new Event("blur", { bubbles: true }));

    await delay(350);
    if (targetRoot && hasRecipientInComposeRoot(targetRoot, expected)) {
      return { filled: true, composeRoot: targetRoot };
    }

    const inputValue = String(toInput.value || "").trim().toLowerCase();
    if (inputValue.includes(expected)) {
      return { filled: true, composeRoot: targetRoot };
    }

    const activeFill = await tryFillRecipientViaActiveTarget(expected, targetRoot || composeRoot || null);
    return { filled: !!activeFill, composeRoot: targetRoot };
  }

  async function reopenComposeWithPrefilledRecipient(email, subject) {
    const to = String(email || "").trim();
    if (!to) {
      return { filled: false, composeRoot: null };
    }

    const hash = "#inbox?compose=new&to=" + encodeURIComponent(to) +
      (subject ? "&su=" + encodeURIComponent(subject) : "");
    if ((window.location.hash || "") !== hash) {
      window.location.hash = hash;
    }

    await delay(2800);
    let composeRoot = await ensureComposeReady(15000, to, subject, false);
    if (!composeRoot) {
      return { filled: false, composeRoot: null };
    }

    if (hasRecipientInComposeRoot(composeRoot, to)) {
      return { filled: true, composeRoot: composeRoot };
    }

    const retry = await setRecipientValue(to, composeRoot);
    return {
      filled: !!retry.filled,
      composeRoot: retry.composeRoot || composeRoot
    };
  }

  function findSignatureNode(bodyEl) {
    if (!bodyEl) {
      return null;
    }
    const signatureSelectors = [
      ".gmail_signature",
      '[data-smartmail="gmail_signature"]',
      "div.gmail_signature"
    ];
    for (let i = 0; i < signatureSelectors.length; i++) {
      const inBody = bodyEl.querySelector(signatureSelectors[i]);
      if (inBody) {
        return inBody;
      }
    }

    const composeRoot =
      bodyEl.closest('div[role="dialog"]') ||
      bodyEl.closest("form") ||
      bodyEl.parentElement;
    if (composeRoot) {
      for (let i = 0; i < signatureSelectors.length; i++) {
        const inRoot = composeRoot.querySelector(signatureSelectors[i]);
        if (inRoot) {
          return inRoot;
        }
      }
    }
    return null;
  }

  function captureSignatureHtml(bodyEl) {
    const signatureNode = findSignatureNode(bodyEl);
    const html = signatureNode ? signatureNode.outerHTML : "";
    if (html) {
      LAST_KNOWN_SIGNATURE_HTML = html;
    }
    return html;
  }

  async function captureSignatureHtmlWithWait(bodyEl, timeoutMs) {
    const immediate = captureSignatureHtml(bodyEl);
    if (immediate) {
      return immediate;
    }

    const timeout = timeoutMs || 4200;
    try {
      bodyEl.focus();
    } catch (_) {
      // ignore
    }
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await delay(120);
      const html = captureSignatureHtml(bodyEl);
      if (html) {
        return html;
      }
    }
    return "";
  }

  function isVisibleNode(node) {
    return !!(node && node.offsetParent !== null);
  }

  function findSignatureToolbarButton(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return null;
    }
    const selectors = [
      'button[aria-label*="insert signature" i]',
      'button[data-tooltip*="insert signature" i]',
      'button[title*="insert signature" i]',
      '[role="button"][aria-label*="insert signature" i]',
      '[role="button"][data-tooltip*="insert signature" i]',
      '[role="button"][title*="insert signature" i]',
      'button[aria-label*="signature" i]',
      'button[data-tooltip*="signature" i]',
      'button[title*="signature" i]',
      '[role="button"][aria-label*="signature" i]',
      '[role="button"][data-tooltip*="signature" i]',
      '[role="button"][title*="signature" i]'
    ];
    for (let i = 0; i < selectors.length; i++) {
      const nodes = scope.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        if (isVisibleNode(nodes[j])) {
          return nodes[j];
        }
      }
    }
    return null;
  }

  function findMoreOptionsButton(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return null;
    }
    const selectors = [
      'button[aria-label*="more options" i]',
      '[role="button"][aria-label*="more options" i]',
      'button[data-tooltip*="more options" i]',
      '[role="button"][data-tooltip*="more options" i]',
      'button[title*="more options" i]',
      '[role="button"][title*="more options" i]',
      'button[aria-label="more" i]',
      '[role="button"][aria-label="more" i]'
    ];
    for (let i = 0; i < selectors.length; i++) {
      const nodes = scope.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        if (isVisibleNode(nodes[j])) {
          return nodes[j];
        }
      }
    }
    return null;
  }

  function findInsertSignatureActionItem() {
    const items = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="menuitemcheckbox"], div[role="menuitemradio"]'));
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!isVisibleNode(item)) {
        continue;
      }
      const text = String(item.textContent || "").trim().toLowerCase();
      if (!text) {
        continue;
      }
      if (text.indexOf("insert signature") !== -1 || text === "signature" || /^signature\b/.test(text)) {
        return item;
      }
    }
    return null;
  }

  function findBestSignatureMenuItem() {
    const items = Array.from(
      document.querySelectorAll('div[role="menuitemradio"], div[role="menuitemcheckbox"], div[role="menuitem"]')
    ).filter(isVisibleNode);

    if (!items.length) {
      return null;
    }

    const candidates = items.filter(function(item) {
      const text = String(item.textContent || "").trim().toLowerCase();
      return text && !/^no signature$/.test(text);
    });

    if (!candidates.length) {
      return null;
    }

    for (let i = 0; i < candidates.length; i++) {
      const checked = String(candidates[i].getAttribute("aria-checked") || "").toLowerCase();
      if (checked === "true") {
        return candidates[i];
      }
    }

    return candidates[0];
  }

  function placeCaretAtEnd(node) {
    if (!node) {
      return;
    }
    try {
      node.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_) {
      // ignore
    }
  }

  async function tryInsertGmailSignature(composeRoot, bodyEl) {
    if (!bodyEl) {
      return "";
    }

    placeCaretAtEnd(bodyEl);

    const existing = captureSignatureHtml(bodyEl);
    if (existing) {
      return existing;
    }

    const scopes = [];
    if (composeRoot) scopes.push(composeRoot);
    const dialogRoot = bodyEl.closest('div[role="dialog"]');
    if (dialogRoot && scopes.indexOf(dialogRoot) === -1) scopes.push(dialogRoot);
    scopes.push(document);

    let signatureButton = null;
    for (let i = 0; i < scopes.length; i++) {
      signatureButton = findSignatureToolbarButton(scopes[i]);
      if (signatureButton) {
        break;
      }
    }

    if (!signatureButton) {
      let moreBtn = null;
      for (let i = 0; i < scopes.length; i++) {
        moreBtn = findMoreOptionsButton(scopes[i]);
        if (moreBtn) {
          break;
        }
      }
      if (moreBtn) {
        try {
          moreBtn.click();
          await delay(220);
        } catch (_) {
          // ignore
        }
        const insertSignatureItem = findInsertSignatureActionItem();
        if (insertSignatureItem) {
          try {
            insertSignatureItem.click();
            await delay(280);
          } catch (_) {
            // ignore
          }
          const fromMenuAction = await captureSignatureHtmlWithWait(bodyEl, 2200);
          if (fromMenuAction) {
            log("Gmail signature inserted from More options menu");
            return fromMenuAction;
          }
        }
      }

      if (LAST_KNOWN_SIGNATURE_HTML) {
        log("Using cached Gmail signature HTML fallback");
        return LAST_KNOWN_SIGNATURE_HTML;
      }
      return "";
    }

    try {
      placeCaretAtEnd(bodyEl);
      signatureButton.click();
      await delay(280);
    } catch (_) {
      return "";
    }

    let inserted = await captureSignatureHtmlWithWait(bodyEl, 700);
    if (inserted) {
      log("Gmail signature inserted from toolbar button");
      return inserted;
    }

    const menuItem = findBestSignatureMenuItem();
    if (menuItem) {
      try {
        menuItem.click();
        await delay(220);
      } catch (_) {
        // ignore
      }
    }

    inserted = await captureSignatureHtmlWithWait(bodyEl, 1500);
    if (inserted) {
      log("Gmail signature inserted from menu selection");
      return inserted;
    }

    if (LAST_KNOWN_SIGNATURE_HTML) {
      log("Using cached Gmail signature HTML fallback");
      return LAST_KNOWN_SIGNATURE_HTML;
    }
    return "";
  }

  function appendSignatureHtml(bodyEl, signatureHtml) {
    if (!bodyEl || !signatureHtml) {
      return;
    }
    if (bodyEl.querySelector(".gmail_signature")) {
      return;
    }

    const hasVisibleBodyText = !!String(bodyEl.textContent || "").trim();
    if (hasVisibleBodyText) {
      bodyEl.insertAdjacentHTML("beforeend", "<div><br></div>");
    }
    bodyEl.insertAdjacentHTML("beforeend", signatureHtml);
    LAST_KNOWN_SIGNATURE_HTML = signatureHtml;
  }

  function setBodyContent(bodyEl, html, signatureHtml) {
    bodyEl.focus();
    
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(bodyEl);
    range.deleteContents();
    
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertHTML", false, html);
      log("Body inserted");
    } catch (e) {
      log("execCommand failed, fallback:", e.message);
      // Fallback
      bodyEl.innerHTML = html || "";
    }

    appendSignatureHtml(bodyEl, signatureHtml);
    
    bodyEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function clickSendButton(composeRoot, bodyEl) {
    function isVisible(node) {
      return !!(node && node.offsetParent !== null);
    }

    function findSendButtonInScope(scope) {
      if (!scope || typeof scope.querySelectorAll !== "function") {
        return null;
      }
      const selectors = [
        'button[aria-label^="Send"]',
        'div[role="button"][aria-label^="Send"]',
        'button[data-tooltip^="Send"]',
        'div[role="button"][data-tooltip^="Send"]',
        'button[title^="Send"]',
        'div[role="button"][title^="Send"]',
        ".aoO",
        ".T-I-atl"
      ];
      for (let i = 0; i < selectors.length; i++) {
        const nodes = scope.querySelectorAll(selectors[i]);
        for (let j = 0; j < nodes.length; j++) {
          const btn = nodes[j];
          if (isVisible(btn)) {
            return { btn: btn, selector: selectors[i] };
          }
        }
      }
      return null;
    }

    // First, prefer the send button that is in the same compose ancestry as bodyEl.
    if (bodyEl) {
      let node = bodyEl;
      let hops = 0;
      while (node && hops < 14) {
        const found = findSendButtonInScope(node);
        if (found && found.btn) {
          found.btn.click();
          log("Send button clicked via body-bound scope selector:", found.selector);
          return true;
        }
        node = node.parentElement;
        hops += 1;
      }
    }

    const scopes = [];
    if (composeRoot) scopes.push(composeRoot);
    if (bodyEl) {
      const nearScopes = [
        bodyEl.closest('div[role="dialog"]'),
        bodyEl.closest("form"),
        bodyEl.closest('div[aria-label*="Message"]'),
        bodyEl.parentElement
      ];
      for (let i = 0; i < nearScopes.length; i++) {
        const s = nearScopes[i];
        if (s && scopes.indexOf(s) === -1) scopes.push(s);
      }
    }
    scopes.push(document);

    const selectors = [
      'button[aria-label^="Send"]',
      'div[role="button"][aria-label^="Send"]',
      'button[data-tooltip^="Send"]',
      'div[role="button"][data-tooltip^="Send"]',
      'button[title^="Send"]',
      'div[role="button"][title^="Send"]',
      ".aoO",
      ".T-I-atl"
    ];

    for (let s = 0; s < scopes.length; s++) {
      const scope = scopes[s];
      for (let i = 0; i < selectors.length; i++) {
        const btn = scope.querySelector(selectors[i]);
        if (btn && isVisible(btn)) {
          btn.click();
          log("Send button clicked via selector:", selectors[i]);
          return true;
        }
      }
    }

    // Text fallback across scopes.
    for (let s = 0; s < scopes.length; s++) {
      const scope = scopes[s];
      const allButtons = scope.querySelectorAll('div[role="button"], button');
      for (let i = 0; i < allButtons.length; i++) {
        const btn = allButtons[i];
        if (!isVisible(btn)) continue;
        const label = (btn.getAttribute("aria-label") || btn.getAttribute("data-tooltip") || btn.textContent || "").trim().toLowerCase();
        if (!label) continue;
        if (label === "send" || /^send\b/.test(label) || label.indexOf("send message") !== -1) {
          btn.click();
          log("Send clicked via text fallback:", label);
          return true;
        }
      }
    }

    log("Send button not found");
    return false;
  }

  function findComposeButton() {
    const selectors = [
      'div[gh="cm"]',
      'div[role="button"][gh="cm"]',
      'div[role="button"][aria-label*="Compose"]',
      'div[role="button"][data-tooltip*="Compose"]',
      'button[aria-label*="Compose"]'
    ];
    for (let i = 0; i < selectors.length; i++) {
      const btn = document.querySelector(selectors[i]);
      if (btn && btn.offsetParent !== null) {
        return btn;
      }
    }
    return null;
  }

  function isComposeHashRoute() {
    const hash = window.location.hash || "";
    return /[?&]compose=/.test(hash);
  }

  async function ensureComposeReady(maxWait, email, subject, allowComposeClick) {
    let composeRoot = pickComposeRoot(email, subject);
    if (composeRoot) {
      return composeRoot;
    }

    const composeRoute = isComposeHashRoute();
    if (allowComposeClick !== false && !composeRoute) {
      const composeBtn = findComposeButton();
      if (composeBtn) {
        try {
          composeBtn.click();
          log("Clicked Compose to open draft");
        } catch (e) {
          logError("Compose click failed:", e.message);
        }
        await delay(1000);
      }
    } else if (composeRoute) {
      log("Compose route detected; skipping extra Compose click");
    }

    await waitForBodyElement(maxWait || 12000, null);
    composeRoot = pickComposeRoot(email, subject);
    return composeRoot;
  }

  function findViewMessageControl() {
    try {
      const candidates = document.querySelectorAll('a, button, div[role="link"], div[role="button"], span');
      for (let i = 0; i < candidates.length; i++) {
        const node = candidates[i];
        const text = (node.textContent || "").trim().toLowerCase();
        if (!text || !text.includes("view message")) {
          continue;
        }

        return node;
      }

      return null;
    } catch (e) {
      logError("findViewMessageControl error:", e.message);
      return null;
    }
  }

  function getSendStatusText() {
    const candidates = document.querySelectorAll("span, div");
    for (let i = 0; i < candidates.length; i++) {
      const text = (candidates[i].textContent || "").trim().toLowerCase();
      if (!text) {
        continue;
      }
      if (text === "sending..." || text === "message sent") {
        return text;
      }
    }
    return "";
  }

  function findReplyButton() {
    const selectors = [
      'div[role="button"][aria-label="Reply"]',
      'div[role="button"][aria-label="Reply to all"]',
      'button[aria-label="Reply"]',
      'button[aria-label="Reply to all"]',
      'button[data-tooltip="Reply"]',
      'button[data-tooltip="Reply to all"]',
      '[data-tooltip="Reply"]',
      '[data-tooltip="Reply to all"]',
    ];
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      if (el) {
        log("Reply button found:", selectors[i]);
        return el;
      }
    }
    const buttons = document.querySelectorAll('button, div[role="button"], [role="button"]');
    for (let j = 0; j < buttons.length; j++) {
      const btn = buttons[j];
      const label = (btn.getAttribute("aria-label") || btn.getAttribute("data-tooltip") || btn.textContent || "").trim().toLowerCase();
      if (label === "reply" || label === "reply to all" || /^reply\b/.test(label)) {
        return btn;
      }
    }
    return null;
  }

  function countViewMessageControls() {
    try {
      let count = 0;
      const candidates = document.querySelectorAll('a, button, div[role="link"], div[role="button"], span');
      for (let i = 0; i < candidates.length; i++) {
        const text = (candidates[i].textContent || "").trim().toLowerCase();
        if (text && text.includes("view message")) {
          count += 1;
        }
      }
      return count;
    } catch (_) {
      return 0;
    }
  }

  async function triggerReplyShortcutAndWait() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "r", code: "KeyR", bubbles: true }));
      await delay(1500);
      return true;
    } catch (e) {
      logError("Reply shortcut failed:", e.message);
      return false;
    }
  }

  async function clickReplyAndWaitForCompose() {
    const beforeBodies = countVisibleBodyEditors();
    const replyBtn = findReplyButton();
    if (replyBtn) {
      try {
        replyBtn.click();
        log("Clicked Reply");
        await delay(1600);
      } catch (e) {
        logError("clickReply error:", e.message);
      }
    } else {
      log("Reply button not found");
    }

    let afterBodies = countVisibleBodyEditors();
    if (afterBodies > beforeBodies || !!findInlineComposeRoot()) {
      return true;
    }

    await triggerReplyShortcutAndWait();
    afterBodies = countVisibleBodyEditors();
    if (afterBodies > beforeBodies || !!findInlineComposeRoot()) {
      log("Reply compose opened via keyboard shortcut");
      return true;
    }

    return false;
  }

  /** Extract web UI thread ID from URL that contains #all/ID, #inbox/ID, or #sent/ID. */
  function extractThreadIdFromHashPathInUrl(urlOrHash) {
    if (!urlOrHash || typeof urlOrHash !== "string") return null;
    try {
      const decoded = decodeURIComponent(urlOrHash);
      const match = decoded.match(/#(?:all|inbox|sent)\/([A-Za-z0-9_-]{12,})(?:\?|&|$)/i);
      if (match) {
        return match[1];
      }
      const searchMatch = decoded.match(/#search\/[^/]+\/([A-Za-z0-9_-]{12,})(?:\?|&|$)/i);
      return searchMatch ? searchMatch[1] : null;
    } catch (e) {
      return null;
    }
  }

  function getThreadIdFromSearchHashPath() {
    try {
      const hashRaw = (window.location.hash || "").replace(/^#+/, "").trim();
      if (!hashRaw || hashRaw.indexOf("search/") !== 0) {
        return null;
      }
      const parts = hashRaw.split("/").filter(Boolean);
      if (parts.length < 3) {
        return null;
      }
      const last = parts[parts.length - 1].split("?")[0].split("&")[0].trim();
      if (/^[A-Za-z0-9_-]{12,}$/.test(last)) {
        log("Thread ID from search hash path:", last);
        return last;
      }
      return null;
    } catch (e) {
      logError("getThreadIdFromSearchHashPath error:", e.message);
      return null;
    }
  }

  function extractThreadIdFromHref(rawHref) {
    if (!rawHref || typeof rawHref !== "string") {
      return null;
    }
    const fromHashPath = extractThreadIdFromHashPathInUrl(rawHref);
    if (fromHashPath) {
      return fromHashPath;
    }
    const thMatch = rawHref.match(/[?&]th=([A-Za-z0-9_-]{12,})/i);
    if (thMatch && thMatch[1]) {
      return thMatch[1];
    }
    return null;
  }

  function normalizeSubjectForSearch(subject) {
    const trimmed = String(subject || "").trim();
    if (!trimmed) {
      return "";
    }
    let normalized = trimmed.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "");
    normalized = normalized.replace(/\s+/g, " ").trim();
    normalized = normalized.replace(/"/g, "");
    if (normalized.length > 140) {
      normalized = normalized.substring(0, 140).trim();
    }
    return normalized;
  }

  function findTopMessageThreadIdFromList() {
    const selectors = [
      "tr.zA a[href]",
      "div[role='main'] table tr a[href]"
    ];
    for (let i = 0; i < selectors.length; i++) {
      const links = document.querySelectorAll(selectors[i]);
      for (let j = 0; j < links.length; j++) {
        const link = links[j];
        if (!link || link.offsetParent === null) {
          continue;
        }
        const href = link.getAttribute("href") || link.href || "";
        const threadId = extractThreadIdFromHref(href);
        if (threadId) {
          log("Thread ID from top message list result:", threadId);
          return threadId;
        }
      }
    }
    return null;
  }

  function extractThreadIdFromAttributeValue(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    // Only trust values that look like URLs or URL fragments.
    if (raw.indexOf("#") === -1 && raw.indexOf("th=") === -1 && raw.indexOf("/") === -1) {
      return null;
    }

    return extractThreadIdFromHref(raw);
  }

  function extractThreadIdFromRow(row) {
    if (!row) {
      return null;
    }

    const directLink = row.querySelector("a[href]");
    if (directLink) {
      const href = directLink.getAttribute("href") || directLink.href || "";
      const fromLink = extractThreadIdFromHref(href);
      if (fromLink) {
        log("Thread ID from message row link:", fromLink);
        return fromLink;
      }
    }

    const nodes = [row].concat(Array.from(row.querySelectorAll("*")));
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node || typeof node.getAttributeNames !== "function") {
        continue;
      }
      const attrNames = node.getAttributeNames();
      for (let j = 0; j < attrNames.length; j++) {
        const attr = attrNames[j];
        if (!/^(href|data-url|data-href|src|data-thread-id|data-legacy-thread-id|data-thread-perm-id)$/i.test(attr)) {
          continue;
        }
        const value = node.getAttribute(attr) || "";
        const extracted = extractThreadIdFromAttributeValue(value);
        if (extracted) {
          log("Thread ID from message row attribute:", attr, extracted);
          return extracted;
        }
      }
    }

    return null;
  }

  function buildSubjectNeedles(subject) {
    const normalized = normalizeSubjectForSearch(subject).toLowerCase();
    if (!normalized) {
      return [];
    }
    return normalized
      .split(/\s+/)
      .map(function(token) { return token.trim(); })
      .filter(function(token) { return token.length >= 4; })
      .slice(0, 4);
  }

  function scoreMessageRow(row, toEmail, subject) {
    if (!row) {
      return -1;
    }
    const text = (row.textContent || "").toLowerCase();
    if (!text) {
      return -1;
    }

    let score = 0;
    const email = String(toEmail || "").trim().toLowerCase();
    if (email) {
      const local = email.split("@")[0];
      if (text.indexOf(email) !== -1) {
        score += 8;
      }
      if (local && text.indexOf(local) !== -1) {
        score += 3;
      }
    }

    const needles = buildSubjectNeedles(subject);
    for (let i = 0; i < needles.length; i++) {
      if (text.indexOf(needles[i]) !== -1) {
        score += 2;
      }
    }

    const rowThread = extractThreadIdFromRow(row);
    if (rowThread) {
      score += 3;
    }

    return score;
  }

  function findBestVisibleMessageRow(toEmail, subject) {
    const rows = document.querySelectorAll("tr.zA, div[role='main'] table tr");
    let bestRow = null;
    let bestScore = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.offsetParent === null) {
        continue;
      }
      const score = scoreMessageRow(row, toEmail, subject);
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    return bestRow || findFirstVisibleMessageRow();
  }

  function findFirstVisibleMessageRow() {
    const rows = document.querySelectorAll("tr.zA, div[role='main'] table tr");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.offsetParent === null) {
        continue;
      }
      const text = (row.textContent || "").trim();
      if (!text) {
        continue;
      }
      return row;
    }
    return null;
  }

  function clickMessageRow(row) {
    if (!row) {
      return false;
    }
    try {
      const link = row.querySelector("a[href]");
      if (link) {
        const href = link.getAttribute("href") || link.href || "";
        if (href) {
          const target = new URL(href, window.location.href).toString();
          window.location.href = target;
          log("Navigated to message row URL:", target);
          return true;
        }
      }

      row.click();
      log("Clicked message row to open thread");
      return true;
    } catch (e) {
      logError("clickMessageRow error:", e.message);
      return false;
    }
  }

  function findViewMessageThreadId() {
    try {
      const control = findViewMessageControl();
      if (!control) {
        return null;
      }

      const href =
        control.getAttribute("href") ||
        control.href ||
        "";
      const dataUrl = control.getAttribute("data-url") || "";
      const nestedLink = control.querySelector ? control.querySelector("a[href]") : null;
      const nestedHref = nestedLink ? (nestedLink.getAttribute("href") || nestedLink.href || "") : "";

      const fromHashPath =
        extractThreadIdFromHashPathInUrl(href) ||
        extractThreadIdFromHashPathInUrl(dataUrl) ||
        extractThreadIdFromHashPathInUrl(nestedHref);
      if (fromHashPath) {
        log("Thread ID from View message link (hash path):", fromHashPath);
        return fromHashPath;
      }

      const sources = [href, dataUrl, nestedHref];
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        if (!src) continue;
        const thMatch = src.match(/[?&]th=([A-Za-z0-9_-]{12,})/i);
        if (thMatch && thMatch[1]) {
          log("Thread ID from View message link (th param):", thMatch[1]);
          return thMatch[1];
        }
      }

      // Some Gmail UIs expose the destination in data-thread-id-like attributes.
      const attrs = ["data-thread-id", "data-thread-perm-id", "data-legacy-thread-id"];
      for (let i = 0; i < attrs.length; i++) {
        const v = control.getAttribute(attrs[i]) || "";
        if (!v) continue;
        const fromAttr = extractThreadIdFromAttributeValue(v) || (/^[A-Za-z0-9_-]{12,}$/.test(v) ? v : null);
        if (fromAttr) {
          log("Thread ID from View message attribute:", attrs[i], fromAttr);
          return fromAttr;
        }
      }

      return null;
    } catch (e) {
      logError("findViewMessageThreadId error:", e.message);
      return null;
    }
  }

  /**
   * Get thread ID only from URL hash in Gmail's format: #all/ID, #inbox/ID, #sent/ID.
   * This is the ID format Gmail expects when opening a thread; other formats (e.g. numeric)
   * can cause "The conversation that you requested no longer exists."
   */
  function getThreadIdFromHashPath() {
    const hash = (window.location.hash || "").replace(/^#+/, "").trim();
    const match = hash.match(/^(?:all|inbox|sent)\/([A-Za-z0-9_-]{12,})(?:\?|$)/);
    if (match && match[1]) {
      log("Thread ID from hash path:", match[1]);
      return match[1];
    }
    return null;
  }

  function getThreadId() {
    log("Checking thread ID from trusted sources only");

    const fromHashPath = getThreadIdFromHashPath();
    if (fromHashPath) {
      return fromHashPath;
    }

    const fromSearchHashPath = getThreadIdFromSearchHashPath();
    if (fromSearchHashPath) {
      return fromSearchHashPath;
    }

    const fromViewMessage = findViewMessageThreadId();
    if (fromViewMessage) {
      return fromViewMessage;
    }

    log("No trusted thread ID found yet");
    return null;
  }

  function isTrustedThreadId(threadId) {
    return typeof threadId === "string" && /^[A-Za-z0-9_-]{12,}$/.test(threadId);
  }

  function getThreadSenderEmails() {
    const selectors = [
      ".adn .gD[email]",
      ".h7 .gD[email]",
      ".gD[email]",
      "span.gD[email]"
    ];
    const emails = new Set();

    for (let i = 0; i < selectors.length; i++) {
      const nodes = document.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        const raw = (node.getAttribute("email") || node.getAttribute("data-hovercard-id") || "").trim().toLowerCase();
        if (!raw) {
          continue;
        }
        if (!raw.includes("@")) {
          continue;
        }
        emails.add(raw);
      }
    }

    return Array.from(emails);
  }

  async function waitForRecipientSender(recipientEmail, timeoutMs) {
    const expected = normalizeEmailValue(recipientEmail);
    const timeout = timeoutMs || 15000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const senders = getThreadSenderEmails();
      if (senders.length > 0) {
        const matched = senders.some(function(sender) {
          const s = normalizeEmailValue(sender);
          return s === expected || s.indexOf(expected) !== -1;
        });
        return { replied: matched, senders: senders };
      }
      await delay(600);
    }

    return { replied: false, senders: getThreadSenderEmails() };
  }

  async function checkThreadReply(data) {
    const threadId = String((data && data.threadId) || "").trim().replace(/^#+/, "");
    const recipientEmail = String((data && data.recipientEmail) || "").trim().toLowerCase();

    if (!threadId || !recipientEmail) {
      return { replied: false, senders: [] };
    }

    const currentHash = (window.location.hash || "").replace(/^#+/, "");
    if (currentHash.indexOf(threadId) === -1) {
      window.location.hash = "#all/" + threadId;
      await delay(2800);
    }

    const text = (document.body && document.body.innerText) || "";
    if (/conversation that you requested no longer exists/i.test(text)) {
      return { replied: false, senders: [] };
    }

    const result = await waitForRecipientSender(recipientEmail, 16000);
    log("Reply check result:", threadId, recipientEmail, result.replied ? "replied" : "not replied", result.senders);
    return result;
  }

  /**
   * Wait for thread ID from trusted sources only:
   * - URL hash path (#all/ID, #inbox/ID, #sent/ID)
   * - "View message" link hash path or th param
   */
  async function waitForThread(maxWait) {
    const timeout = maxWait || 15000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const threadId = getThreadId();
      if (threadId) {
        log("Thread confirmed from trusted source:", threadId);
        return threadId;
      }
      await delay(1000);
    }

    log("Thread timeout (no trusted thread ID found)");
    return null;
  }

  async function waitForSendCompletion(maxWait, baseline) {
    const timeout = maxWait || 15000;
    const start = Date.now();
    const base = baseline || {};
    const hadMessageSentBefore = !!base.hadMessageSent;
    const viewCountBefore = Number(base.viewCount || 0);
    let sawSending = false;

    while (Date.now() - start < timeout) {
      const statusText = getSendStatusText();
      if (statusText === "sending...") {
        sawSending = true;
      }
      if (statusText === "message sent") {
        if (sawSending || !hadMessageSentBefore) {
          log("Send completion confirmed from status toast");
          return true;
        }
      }

      if (countViewMessageControls() > viewCountBefore || (!hadMessageSentBefore && findViewMessageControl())) {
        log("Send completion inferred from View message control");
        return true;
      }

      await delay(300);
    }

    log("Send completion timeout");
    return false;
  }

  async function openViewMessageIfAvailable() {
    const control = findViewMessageControl();
    if (!control) {
      return false;
    }

    try {
      control.click();
      log("Clicked View message control");
      await delay(1500);
      return true;
    } catch (e) {
      logError("openViewMessageIfAvailable error:", e.message);
      return false;
    }
  }

  async function openViewMessageWithRetry(maxWait) {
    const timeout = maxWait || 8000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const opened = await openViewMessageIfAvailable();
      if (opened) {
        return true;
      }
      await delay(200);
    }

    log("View message control not found in retry window");
    return false;
  }

  async function findThreadIdViaSentSearch(to, subject, maxWait) {
    const toEmail = String(to || "").trim();
    if (!toEmail) {
      return null;
    }

    const normalizedSubject = normalizeSubjectForSearch(subject);
    const queryParts = [
      "in:sent",
      "to:" + toEmail,
      "newer_than:2d"
    ];
    if (normalizedSubject) {
      queryParts.push('subject:"' + normalizedSubject + '"');
    }
    const query = queryParts.join(" ");
    const targetHash = "#search/" + encodeURIComponent(query);

    log("Searching sent items for thread:", query);

    if ((window.location.hash || "") !== targetHash) {
      window.location.hash = targetHash;
    }

    await delay(2200);

    const timeout = maxWait || 20000;
    const start = Date.now();
    let clickedIntoMessage = false;
    while (Date.now() - start < timeout) {
      const threadId = getThreadIdFromHashPath() || getThreadIdFromSearchHashPath() || findTopMessageThreadIdFromList();
      if (threadId) {
        log("Thread ID found via sent search:", threadId);
        return threadId;
      }

      const matchedRow = findBestVisibleMessageRow(toEmail, normalizedSubject);
      if (matchedRow) {
        const fromRow = extractThreadIdFromRow(matchedRow);
        if (fromRow) {
          log("Thread ID found from matched sent row:", fromRow);
          return fromRow;
        }
      }

      if (!clickedIntoMessage && matchedRow) {
        if (clickMessageRow(matchedRow)) {
          clickedIntoMessage = true;
          await delay(2400);
          const openedThreadId = getThreadIdFromHashPath() || getThreadIdFromSearchHashPath();
          if (openedThreadId) {
            log("Thread ID found after opening sent message:", openedThreadId);
            return openedThreadId;
          }
        }
      }
      await delay(700);
    }

    log("Sent search fallback did not find a thread ID");
    return null;
  }

  async function forceOpenSentAndExtractThreadId(to, subject, maxWait) {
    const toEmail = String(to || "").trim();
    const normalizedSubject = normalizeSubjectForSearch(subject);
    const timeout = maxWait || 60000;
    const start = Date.now();
    let openedRow = false;

    log("Force-open sent fallback started");

    const hash = (window.location.hash || "").replace(/^#+/, "");
    if (!/^sent(?:[/?#]|$)/i.test(hash)) {
      window.location.hash = "#sent";
      await delay(2200);
    }

    while (Date.now() - start < timeout) {
      const directId =
        getThreadIdFromHashPath() ||
        getThreadIdFromSearchHashPath() ||
        extractThreadIdFromHref(window.location.href) ||
        extractThreadIdFromHref(window.location.hash);
      if (directId) {
        log("Thread ID found in force-open sent flow:", directId);
        return directId;
      }

      const bestRow = findBestVisibleMessageRow(toEmail, normalizedSubject) || findFirstVisibleMessageRow();
      if (bestRow) {
        const fromRow = extractThreadIdFromRow(bestRow);
        if (fromRow) {
          log("Thread ID from force-open row parse:", fromRow);
          return fromRow;
        }

        if (!openedRow) {
          if (clickMessageRow(bestRow)) {
            openedRow = true;
            await delay(2800);
            const afterOpenId =
              getThreadIdFromHashPath() ||
              getThreadIdFromSearchHashPath() ||
              extractThreadIdFromHref(window.location.href) ||
              extractThreadIdFromHref(window.location.hash);
            if (afterOpenId) {
              log("Thread ID after force-open row navigation:", afterOpenId);
              return afterOpenId;
            }
          }
        }
      } else {
        if (toEmail) {
          const parts = ["in:sent", "to:" + toEmail, "newer_than:7d"];
          if (normalizedSubject) {
            parts.push('subject:"' + normalizedSubject + '"');
          }
          window.location.hash = "#search/" + encodeURIComponent(parts.join(" "));
          await delay(2200);
        } else {
          await delay(1000);
        }
      }

      await delay(900);
    }

    log("Force-open sent fallback did not find a thread ID");
    return null;
  }

  async function updateLead(leadId, to, subject, body, threadId) {
    try {
      log("=== UPDATING LEAD ===");
      log("LeadId:", leadId);
      log("To:", to);
      log("Subject:", subject ? subject.substring(0, 50) : "none");
      log("Body length:", body ? body.length : 0);
      log("Thread ID extracted:", threadId);

      if (!leadId) {
        logError("CRITICAL: No leadId provided");
        return;
      }
      
      const payload = {
        leadId: leadId,
        recipientEmail: to,
        subject: subject || "",
        body: body || ""
      };
      if (threadId) {
        payload.threadId = threadId;
      }
      
      log("Payload:", JSON.stringify(payload).substring(0, 200));

      const response = await chrome.runtime.sendMessage({
        action: "updateLeadStatus",
        data: payload,
      });

      log("Response data:", response);

      if (response && response.success) {
        log("Lead updated successfully");
      } else {
        logError("Update failed:", response && response.error ? response.error : "Unknown error");
      }
    } catch (e) {
      logError("Update error:", e.message, e.stack);
    }
  }

  async function closeCurrentAutomationTab() {
    try {
      await chrome.runtime.sendMessage({ action: "closeCurrentTab" });
    } catch (_) {
      // Ignore.
    }
  }

  async function fillAndSend(data) {
    let to = data.to || "";
    let subject = data.subject || "";
    const body = data.body || "";
    const customSignatureText = String(data.customSignature || "");
    const customSignatureHtml = formatCustomSignatureHtml(customSignatureText);
    const leadId = data.leadId || "";
    const isFollowup = !!data.isFollowup;
    const openReply = !!data.openReply;
    const threadIdForUrl = (data.threadIdForUrl || "").trim();
    const autoSend = data.autoSend !== false;
    const requireThreadReply = isFollowup && openReply;

    log("Starting fill and send", isFollowup ? "(follow-up)" : "", openReply ? "(reply in thread)" : "");
    
    await delay(openReply ? 2500 : 1500);

    function hasConversationNoLongerExistsError() {
      const text = (document.body && document.body.innerText) || "";
      return /conversation that you requested no longer exists/i.test(text);
    }

    if (openReply) {
      if (hasConversationNoLongerExistsError()) {
        log("Thread not found (conversation no longer exists); opening new compose");
        const composeUrl = "https://mail.google.com/mail/u/0/#inbox?compose=new" +
          "&to=" + encodeURIComponent(to || "") +
          "&su=" + encodeURIComponent(subject || "");
        window.location.href = composeUrl;
        await delay(4000);
      } else if (threadIdForUrl) {
        const currentHash = (window.location.hash || "").replace(/^#+/, "");
        const threadInHash = currentHash.indexOf(threadIdForUrl) !== -1;
        if (!threadInHash) {
          log("Navigating to thread:", threadIdForUrl);
          window.location.hash = "#all/" + threadIdForUrl;
          await delay(3500);
          if (hasConversationNoLongerExistsError()) {
            log("Thread not found after navigation; opening new compose");
            const composeUrl = "https://mail.google.com/mail/u/0/#inbox?compose=new" +
              "&to=" + encodeURIComponent(to || "") +
              "&su=" + encodeURIComponent(subject || "");
            window.location.href = composeUrl;
            await delay(4000);
          }
        }
        const clicked = await clickReplyAndWaitForCompose();
        if (!clicked) {
          log("Could not open Reply compose");
          if (requireThreadReply) {
            logError("Aborting follow-up: reply composer not available for thread");
            return;
          }
        }
        await delay(2000);
      } else {
        const clicked = await clickReplyAndWaitForCompose();
        if (!clicked) {
          log("Could not open Reply compose");
          if (requireThreadReply) {
            logError("Aborting follow-up: reply composer not available for thread");
            return;
          }
        }
        await delay(2000);
      }
    }

    if (!to || !subject) {
      const hash = window.location.hash || "";
      const qIndex = hash.indexOf("?");
      if (qIndex !== -1) {
        const params = new URLSearchParams(hash.substring(qIndex + 1));
        if (!to) {
          const toFromHash = (params.get("to") || "").trim();
          if (toFromHash) {
            to = toFromHash;
            log("Recovered recipient from URL hash");
          }
        }
        if (!subject) {
          const subjectFromHash = (params.get("su") || "").trim();
          if (subjectFromHash) {
            subject = subjectFromHash;
            log("Recovered subject from URL hash");
          }
        }
      }
    }

    let composeRoot = await ensureComposeReady(12000, to, subject, !requireThreadReply);
    if (!composeRoot) {
      logError("Compose window is not ready");
      return;
    }
    
    // Fill To
    let toFilled = requireThreadReply;
    if (to && !requireThreadReply) {
      const recipientResult = await setRecipientValue(to, composeRoot);
      toFilled = !!recipientResult.filled;
      if (recipientResult.composeRoot) {
        composeRoot = recipientResult.composeRoot;
      }
      if (!toFilled) {
        log("To input not found or recipient not confirmed; trying compose URL fallback");
        const fallbackRecipient = await reopenComposeWithPrefilledRecipient(to, subject);
        toFilled = !!fallbackRecipient.filled;
        if (fallbackRecipient.composeRoot) {
          composeRoot = fallbackRecipient.composeRoot;
        }
        if (!toFilled) {
          logError("Recipient still not confirmed after compose URL fallback");
        }
      } else {
        log("To filled");
        await delay(200);
      }
    } else if (!requireThreadReply) {
      logError("Recipient email is empty before fill");
    }
    
    // Fill Subject
    const subjInput = requireThreadReply ? null : findSubjectInput(document, composeRoot);
    if (subjInput && subject && !requireThreadReply) {
      setInputValue(subjInput, subject);
      log("Subject filled");
      await delay(200);
    }
    
    // Wait for body element
    const bodyEl = await waitForBodyElement(12000, composeRoot);
    if (!bodyEl) {
      logError("Body element not found in selected compose");
      return;
    }
    
    // Fill Body
    if (body) {
      let signatureHtml = await captureSignatureHtmlWithWait(bodyEl, 1800);
      if (!signatureHtml) {
        signatureHtml = await tryInsertGmailSignature(composeRoot, bodyEl);
      }
      const shouldTrimAiNameAfterSignoff = !!signatureHtml || !!customSignatureHtml;
      const cleanedBody = removeTrailingNameAfterSignoff(body, shouldTrimAiNameAfterSignoff);
      const formatted = formatBody(cleanedBody);
      setBodyContent(bodyEl, formatted, signatureHtml || customSignatureHtml);
      if (!signatureHtml && customSignatureHtml) {
        signatureHtml = customSignatureHtml;
        log("Applied extension custom signature fallback");
      }
      if (!signatureHtml) {
        placeCaretAtEnd(bodyEl);
        const postInsertSignature = await tryInsertGmailSignature(composeRoot, bodyEl);
        if (postInsertSignature) {
          signatureHtml = postInsertSignature;
          appendSignatureHtml(bodyEl, signatureHtml);
          bodyEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
          log("Gmail signature inserted after body fill");
        }
      }
      if (signatureHtml) {
        log("Gmail signature preserved in compose");
      } else {
        log("No signature detected; kept AI sign-off line");
      }
      log("Body filled");
      await delay(500);
    }
    
    if (autoSend) {
      if (!toFilled) {
        logError("Auto send aborted: recipient not confirmed");
        return;
      }
      const sendBaseline = {
        hadMessageSent: getSendStatusText() === "message sent",
        viewCount: countViewMessageControls()
      };
      const clicked = clickSendButton(composeRoot, bodyEl);
      if (!clicked) {
        logError("Auto send failed: Send button not found");
        return;
      }
      log("Auto send triggered, waiting for completion");
      const sendCompleted = await waitForSendCompletion(60000, sendBaseline);
      if (!sendCompleted) {
        log("Auto send completion was not detected before timeout");
        return;
      }
    } else {
      log("Draft ready, waiting for manual send");
      const sendCompleted = await waitForSendCompletion(300000);
      if (!sendCompleted) {
        log("Manual send was not detected before timeout");
        return;
      }
    }

    if (isFollowup && leadId) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: "updateFollowup",
          data: { leadId: leadId },
        });
        if (response && response.success) {
          log("Follow-up recorded");
        } else {
          logError("updateFollowup failed", response && response.error ? response.error : "Unknown");
        }
      } catch (e) {
        logError("updateFollowup error:", e.message);
      }
      log("Follow-up send flow completed");
      log("Keeping follow-up Gmail tab open to avoid beforeunload close prompt");
      return;
    }

    await openViewMessageWithRetry(8000);

    let threadId = await waitForThread(12000);
    if (!threadId) {
      threadId = await findThreadIdViaSentSearch(to, subject, 45000);
    }
    if (!threadId) {
      threadId =
        extractThreadIdFromHref(window.location.href) ||
        extractThreadIdFromHref(window.location.hash) ||
        getThreadIdFromSearchHashPath() ||
        null;
      if (threadId) {
        log("Thread ID recovered from current URL/hash fallback:", threadId);
      }
    }
    if (!threadId) {
      threadId = await forceOpenSentAndExtractThreadId(to, subject, 70000);
    }

    if (threadId && !isTrustedThreadId(threadId)) {
      logError("Rejected untrusted thread ID:", threadId);
      threadId = null;
    }

    if (leadId) {
      await updateLead(leadId, to, subject, body, threadId);
    }

    log("Manual send flow completed");
    await closeCurrentAutomationTab();
  }

  log("Content script loaded", SCRIPT_VERSION);
})();
