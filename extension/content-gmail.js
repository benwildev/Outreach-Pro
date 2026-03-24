/**
 * Content script: Gmail
 * Fills compose window (To, Subject, Body) and leaves the draft open.
 */

(function () {
  "use strict";

  const SCRIPT_VERSION = "gmail-content-v21-ROBUST-DOM";
  const LOG_PREFIX = "[Gmail Extension]";
  const FALLBACK_API_BASE_URL = "https://automation.benwil.store";
  async function getApiBaseUrl() {
    try {
      const stored = await chrome.storage.local.get({ leadsExtensionDashboardOrigin: "" });
      const origin = String(stored.leadsExtensionDashboardOrigin || "").trim();
      if (origin && /^https?:\/\/.+/.test(origin)) return origin;
    } catch (_) {}
    return FALLBACK_API_BASE_URL;
  }
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
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normalizeEmailValue(value) {
    return String(value || "").trim().toLowerCase();
  }

  function extractEmailFromText(value) {
    const text = String(value || "");
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].trim().toLowerCase() : "";
  }

  function extractAuthUserFromUrl(value) {
    const text = String(value || "");
    const match = text.match(/\/mail\/u\/([^/]+)/i);
    if (!match || !match[1]) {
      return "";
    }
    try {
      return decodeURIComponent(match[1]).trim();
    } catch (_) {
      return String(match[1]).trim();
    }
  }

  function getCurrentAuthUser() {
    return extractAuthUserFromUrl(window.location.href) || extractAuthUserFromUrl(window.location.pathname);
  }

  function getCurrentAccountEmail() {
    // 1. Try to find the ACTIVE profile button in the header.
    // The active button usually has aria-label starting with "Google Account:"
    // and is NOT inside a menu/list (which contains other accounts).
    const selectors = [
      'header a[aria-label^="Google Account:"]',
      'header button[aria-label^="Google Account:"]',
      '.gb_id a[aria-label^="Google Account:"]', // Older Gmail
      'a[aria-label^="Google Account:"]',
      'button[aria-label^="Google Account:"]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const nodes = document.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        // The active button usually doesn't have role=menuitem or be inside a list of other accounts
        if (node.closest('li[role="presentation"]') || node.getAttribute('role') === 'menuitem') continue;
        
        const ariaLabel = node.getAttribute("aria-label") || "";
        // Gmail format is "Google Account: Name (email@address.com)"
        const email = extractEmailFromText(ariaLabel);
        if (email) return email;
      }
    }

    // 2. Extra robust check: Scan the scripts for "OGB_X" or similar which often contains the email
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        if (s.textContent && s.textContent.includes('["')) {
          const email = extractEmailFromText(s.textContent);
          // Only take it if it looks like a real email and isn't too common
          if (email && email.includes('@') && !email.includes('googlegroups.com')) {
             // We can't be 100% sure this is THE primary, but it's a good hint
          }
        }
      }
    } catch(e) {}

    // 2. Fallback to any node with data-email (less reliable if multiple accounts)
    const dataEmailNode = document.querySelector('[data-email]');
    if (dataEmailNode) {
      const email = extractEmailFromText(dataEmailNode.getAttribute("data-email") || "");
      if (email) return email;
    }

    return "";
  }

  function resolveSenderIdentity(expected) {
    // 1. Prefer URL-based identity if it's already an email (most reliable)
    const authFromUrl = getCurrentAuthUser();
    if (authFromUrl && authFromUrl.includes("@")) {
      return authFromUrl.toLowerCase().trim();
    }

    // 2. Otherwise try to find it in the UI
    const emailFromUI = getCurrentAccountEmail();
    if (emailFromUI) return emailFromUI.toLowerCase().trim();

    // 3. Last fallback: use expected email if valid
    if (expected && String(expected).includes("@")) {
      return String(expected).toLowerCase().trim();
    }

    return authFromUrl || expected || "0";
  }

  function getSenderIdentityForStorage(expected) {
    return resolveSenderIdentity(expected);
  }

  function normalizeAuthUser(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getGmailBaseUrl(authUser) {
    const user = normalizeAuthUser(authUser) || "0";
    // Gmail handles the @ symbol raw in /u/ URLs better than %40.
    // CRITICAL: A trailing slash is required to prevent redirects to /u/0 when using emails/indices.
    const encoded = encodeURIComponent(user).replace(/%40/g, "@");
    return "https://mail.google.com/mail/u/" + encoded + "/";
  }

  function isExpectedAuthUser(currentAuthUser, expectedAuthUser) {
    const expected = normalizeAuthUser(expectedAuthUser);
    if (!expected) {
      return true;
    }
    const current = normalizeAuthUser(currentAuthUser);
    // If both are emails, compare case-insensitively (normalizeAuthUser does toLowerCase)
    if (expected.includes("@") && current.includes("@")) {
      return current === expected;
    }
    // Fallback for index-based comparisons
    return current === expected;
  }

  function getComposeRoots(doc) {
    const doc2 = doc || document;
    const roots = Array.from(doc2.querySelectorAll('div[role="dialog"]')).filter(function (root) {
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
    const composeRoots = composeRoot ? [composeRoot] : Array.from(doc2.querySelectorAll('div[role="dialog"]')).filter(function (root) {
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

  function escapeHtmlAttribute(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function splitTrailingPunctuation(token) {
    let core = String(token || "");
    let trailing = "";
    while (core && /[),.;!?]$/.test(core)) {
      trailing = core.slice(-1) + trailing;
      core = core.slice(0, -1);
    }
    return { core, trailing };
  }

  function linkifyInlineText(text) {
    const source = String(text || "");
    const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/gi;
    let out = "";
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const full = match[0];
      const start = match.index;
      out += escapeHtml(source.slice(lastIndex, start));

      if (match[1] && match[2] && match[3]) {
        const label = match[2].trim();
        const href = match[3].trim();
        out += '<a href="' + escapeHtmlAttribute(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label || href) + "</a>";
      } else {
        const split = splitTrailingPunctuation(full);
        const core = split.core;
        const trailing = split.trailing;
        let href = core;

        if (core.indexOf("@") !== -1) {
          href = "mailto:" + core;
        } else if (/^www\./i.test(core)) {
          href = "https://" + core;
        }

        out += '<a href="' + escapeHtmlAttribute(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(core) + "</a>";
        if (trailing) {
          out += escapeHtml(trailing);
        }
      }

      lastIndex = start + full.length;
    }

    out += escapeHtml(source.slice(lastIndex));
    return out;
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

        let shouldPushGap = true;

        // Peek backwards and forwards to see if we are between two bullets.
        // If we are, do not push an empty line, so they group tightly.
        let prevNonEmpty = "";
        for (let p = i - 1; p >= 0; p--) {
          if (lines[p].trim()) { prevNonEmpty = lines[p].trim(); break; }
        }
        let nextNonEmpty = "";
        for (let n = i + 1; n < lines.length; n++) {
          if (lines[n].trim()) { nextNonEmpty = lines[n].trim(); break; }
        }

        if (/^\s*[-*•]/.test(prevNonEmpty) && /^\s*[-*•]/.test(nextNonEmpty)) {
          shouldPushGap = false;
        }

        if (shouldPushGap && output.length > 0 && output[output.length - 1] !== "") {
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

    let trailingSignoffIndex = -1;
    for (let i = output.length - 1; i >= 0; i--) {
      if (isSignoffLine(output[i])) {
        trailingSignoffIndex = i;
        break;
      }
    }

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
      const currentLooksClosing = /^(if |thanks|thank you|best|regards|sincerely|let me know)/i.test(currentTrim);
      const nextLooksClosing = /^(if |thanks|thank you|best|regards|sincerely|let me know)/i.test(nextTrim);

      // Keep signature block compact: no auto extra blank lines after sign-off.
      if (trailingSignoffIndex !== -1 && i >= trailingSignoffIndex) {
        continue;
      }

      if (currentIsBullet && nextIsBullet) {
        // Keep consecutive bullets grouped together tightly without gaps
      } else if (currentLooksHeading && nextIsBullet) {
        // Do not add a gap between the intro sentence and the first bullet
      } else if (currentLooksClosing || nextLooksClosing) {
        // Keep closing sentiments relatively compact
      } else {
        // Ensure there is a blank line before or after the list, or between blocks
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

  function removeTrailingNameAfterSignoff(text, preserveTemplateSignature) {
    const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (preserveTemplateSignature) {
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
          parts.push('<div style="margin: 6px 0 12px 0;"><ul style="margin: 0; padding-left: 22px;">');
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
          parts.push('<li style="margin: 0 0 4px 0;"><b>' + linkifyInlineText(itemText) + "</b></li>");
          continue;
        }

        closeList();
        openParagraph();
        if (isSignoffLine(line)) {
          parts.push("<div><br></div>");
        }
        parts.push("<div>" + linkifyInlineText(line) + "</div>");
      }

      closeParagraph();
      closeList();
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
        parts.push("<div>" + linkifyInlineText(line) + "</div>");
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
    let composeRoot = await ensureComposeReady(18000, to, subject, true);
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

    const candidates = items.filter(function (item) {
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

  function parseScheduleDateTime(raw) {
    const str = String(raw || "").trim();
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // Full ISO-like format: YYYY-MM-DDTHH:MM
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (isoMatch) {
      const year  = isoMatch[1];
      const month = parseInt(isoMatch[2], 10);
      const day   = parseInt(isoMatch[3], 10);
      const hour24 = parseInt(isoMatch[4], 10);
      const min   = parseInt(isoMatch[5], 10);
      // Validate ranges; log and fall through to unknown on bad values
      if (month < 1 || month > 12 || day < 1 || day > 31 || hour24 > 23 || min > 59) {
        logError("parseScheduleDateTime: value out of range:", str);
        return { gmailDate: null, gmailTime: str };
      }
      const period = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const minStr = String(min).padStart(2, "0");
      return {
        gmailDate: MONTH_NAMES[month - 1] + " " + day + ", " + year,
        gmailTime: hour12 + ":" + minStr + " " + period,
      };
    }

    // Time-only format: HH:MM (24-hour) — no date, Gmail will pick its default
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour24 = parseInt(timeMatch[1], 10);
      const min   = parseInt(timeMatch[2], 10);
      if (hour24 > 23 || min > 59) {
        logError("parseScheduleDateTime: time out of range:", str);
        return { gmailDate: null, gmailTime: str };
      }
      const period = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const minStr = String(min).padStart(2, "0");
      return {
        gmailDate: null,
        gmailTime: hour12 + ":" + minStr + " " + period,
      };
    }

    // Unknown format — log a warning and pass through as-is for the time field
    logError("parseScheduleDateTime: unrecognized format:", str, "(expected YYYY-MM-DDTHH:MM)");
    return { gmailDate: null, gmailTime: str };
  }

  async function clickScheduleSendButton(composeRoot, bodyEl, scheduleTime) {
    function isVisible(node) {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      const isDisplayNone = style.display === 'none';
      const isVisibilityHidden = style.visibility === 'hidden';
      // Gmail menus sometimes have 0 width during animation, allow a bit of leniency
      return !isDisplayNone && !isVisibilityHidden;
    }

    const parsed = parseScheduleDateTime(scheduleTime);
    log("(v21) clickScheduleSendButton start:", scheduleTime, "→ date:", parsed.gmailDate, "time:", parsed.gmailTime);

    // 1. Find and click "More send options"
    let moreOptionsBtn = composeRoot.querySelector('div[aria-label*="More send options" i], div[data-tooltip*="More send options" i], div[aria-haspopup="true"][role="button"]');
    if (!moreOptionsBtn) {
      const allBtns = Array.from(composeRoot.querySelectorAll('div[role="button"]'));
      moreOptionsBtn = allBtns.find(el => {
        const label = (el.getAttribute("aria-label") || "").toLowerCase();
        return label.includes("more send options") || label.includes("send options") || (el.innerText || "").includes("▼");
      });
      if (!moreOptionsBtn) {
        // Find the button immediately following the Send button
        const sendBtnIdx = allBtns.findIndex(el => {
          const lbl = (el.getAttribute("aria-label") || "").toLowerCase();
          return lbl.startsWith("send") && !lbl.includes("options");
        });
        if (sendBtnIdx !== -1 && allBtns[sendBtnIdx + 1]) {
          moreOptionsBtn = allBtns[sendBtnIdx + 1];
          log("Found more options button by siblingship to Send.");
        }
      }
    }

    if (!moreOptionsBtn) {
      logError("More send options button not found.");
      return { success: false, error: "Dropdown not found" };
    }

    moreOptionsBtn.click();
    log("Clicked more send options, waiting for menu...");
    await delay(1500);

    // 2. Find "Schedule send" in the menu (with expanded retries)
    let menuClicked = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      // Try roles and everything else
      const allPossible = document.querySelectorAll('div[role="menuitem"], [role="option"], div, span, b');
      let scheduleItem = Array.from(allPossible).find(el => {
        if (!isVisible(el)) return false;
        const text = (el.textContent || "").trim().toLowerCase();
        // Look for "schedule send" or just "schedule" if very short
        return text.includes("schedule send") || (text.includes("schedule") && text.length < 20);
      });

      if (scheduleItem) {
        log("Found schedule menu item, clicking.");
        const clickable = scheduleItem.closest('div[role="menuitem"]') || scheduleItem;
        clickable.click();
        menuClicked = true;
        break;
      }

      log("(v17) Schedule menu item not found, retrying... (attempt " + (attempt + 1) + ")");
      await delay(1000);
    }

    if (!menuClicked) {
      logError("(v17) Schedule send menu item not found after retries.");
      document.body.click(); // dismiss
      return { success: false, error: "Menu item not found" };
    }

    await delay(2000); // Wait for Schedule send popup

    // 3. Click "Pick date & time" — but skip if Gmail already opened the date/time dialog directly
    function isDateTimeDialogOpen() {
      // Check if there's a visible date or time input already on screen (direct dialog path)
      const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);
      return inputs.some(inp => {
        const lbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        return lbl.includes('date') || lbl.includes('time') || inp.type === 'time' || inp.type === 'date';
      });
    }

    if (isDateTimeDialogOpen()) {
      log("(v24) Date/time dialog already open — skipping 'Pick date & time' step.");
    } else {
      // Gmail shows intermediate submenu — find and click "Pick date & time"
      let pickDateClicked = false;
      for (let attempt = 0; attempt < 8; attempt++) {

        // DIAGNOSTIC: log all visible menus and their items
        if (attempt === 0) {
          const allMenus = Array.from(document.querySelectorAll('[role="menu"]'));
          log("(v24) DIAG menus found:", allMenus.length,
            allMenus.map(m => `vis=${isVisible(m)} items=${m.querySelectorAll('[role="menuitem"]').length}`).join(" | "));
          const allItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
          log("(v24) DIAG all menuitems:", allItems.length,
            allItems.slice(0, 6).map(el => `"${(el.textContent||"").trim().slice(0,25)}" vis=${isVisible(el)}`).join(" | "));
        }

        // Strategy 1: last visible menuitem in a visible [role="menu"]
        // "Pick date & time" is always the last item in Gmail's schedule submenu
        const visibleMenus = Array.from(document.querySelectorAll('[role="menu"]')).filter(m => isVisible(m));
        for (const menu of visibleMenus) {
          const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(el => isVisible(el));
          if (items.length >= 2) {
            const lastItem = items[items.length - 1];
            const lastTxt = (lastItem.textContent || "").trim().toLowerCase();
            // Only click if the last item looks like a date picker option
            if (lastTxt.includes("pick") || lastTxt.includes("date") || lastTxt.includes("custom")) {
              lastItem.click();
              pickDateClicked = true;
              log("(v24) Clicked last menuitem in visible menu:", lastTxt.slice(0, 50));
              break;
            }
          }
        }

        if (!pickDateClicked) {
          // Strategy 2: any menuitem whose textContent includes "pick date"
          const allItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
          for (const el of allItems) {
            const txt = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            if (txt.includes("pick date") || txt.includes("pick a date")) {
              el.click();
              pickDateClicked = true;
              log("(v24) Clicked menuitem by text:", txt.slice(0, 50));
              break;
            }
          }
        }

        if (!pickDateClicked) {
          // Strategy 3: TreeWalker to find "pick date" text node then click its ancestor
          const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const txt = (node.nodeValue || "").replace(/\s+/g, " ").trim().toLowerCase();
            if (txt.includes("pick date")) {
              const el = node.parentElement;
              const clickable = el.closest('[role="menuitem"]') || el.closest('[role="option"]') || el.closest('li') || el;
              clickable.click();
              pickDateClicked = true;
              log("(v24) Clicked via text node walk:", txt.slice(0, 50));
              break;
            }
          }
        }

        if (pickDateClicked) break;

        if (isDateTimeDialogOpen()) {
          log("(v24) Date/time dialog appeared during search — proceeding.");
          pickDateClicked = true;
          break;
        }

        log("(v24) Pick date not found yet, retrying... (attempt " + (attempt + 1) + ")");
        await delay(800);
      }

      if (!pickDateClicked) {
        logError("(v24) Pick date option not found and dialog did not open.");
        document.body.click();
        return { success: false, error: "Pick date option not found" };
      }

      await delay(1500);
    }

    // 4. Fill date and time inputs in Gmail's "Pick date & time" dialog
    function fillInput(input, value) {
      input.focus();
      try {
        // setSelectionRange only works on text-like inputs
        if (typeof input.setSelectionRange === "function" && input.type !== "date") {
          input.setSelectionRange(0, (input.value || "").length);
        }
        document.execCommand("selectAll", false);
        document.execCommand("delete", false);
        document.execCommand("insertText", false, value);
      } catch (e) {
        // Fallback for non-standard inputs (e.g. native date pickers)
        input.value = value;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    }

    // Scope input searches to the active modal/dialog so we don't accidentally
    // hit unrelated inputs (e.g. the Gmail search bar) on the page.
    function getDialogRoot() {
      return document.querySelector('[role="dialog"][aria-modal="true"], [role="dialog"]') || document;
    }

    function visibleInputsIn(root) {
      return Array.from(root.querySelectorAll('input')).filter(isVisible);
    }

    // Fill the DATE field first (if we have a date to set)
    if (parsed.gmailDate) {
      const dialogRoot = getDialogRoot();
      const dialogInputs = visibleInputsIn(dialogRoot);
      log("(v21) Dialog inputs found for date search:", dialogInputs.map(i => `[${i.type}] aria-label="${i.getAttribute('aria-label')}"`).join(", "));
      const dateInput = dialogInputs.find(inp => {
        const lbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        return lbl.includes('date') && !lbl.includes('time');
      }) || dialogInputs.find(inp => {
        const lbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        return !lbl.includes('time') && (inp.type === 'text' || inp.type === 'date');
      });

      if (dateInput) {
        fillInput(dateInput, parsed.gmailDate);
        log("(v21) Filled date input:", parsed.gmailDate, "| aria-label:", dateInput.getAttribute('aria-label'));
        await delay(600);
      } else {
        logError("(v21) Date input not found in dialog — Gmail will use its default date. Inputs seen:", dialogInputs.length);
      }
    }

    // Fill the TIME field
    let timeInputFilled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const dialogRoot = getDialogRoot();
      const inputs = visibleInputsIn(dialogRoot);
      // Primary: aria-label contains "time"
      const timeInput = inputs.find(inp => {
        const lbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        return lbl.includes('time');
      }) || inputs.find(inp => {
        // Fallback: first text input whose aria-label does NOT indicate it is a date field
        const lbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        return inp.type === 'text' && !lbl.includes('date') && inp.type !== 'date';
      });

      if (timeInput) {
        fillInput(timeInput, parsed.gmailTime);
        timeInputFilled = true;
        log("(v21) Filled time input:", parsed.gmailTime, "| aria-label:", timeInput.getAttribute('aria-label'), "| type:", timeInput.type);
        break;
      }
      log(`(v21) Time input not found on attempt ${attempt + 1} — inputs in dialog:`, inputs.map(i => `[${i.type}] aria-label="${i.getAttribute('aria-label')}"`).join(", "));
      await delay(800);
    }

    if (!timeInputFilled) {
      logError("(v21) Time input not found after 3 attempts — scheduling cannot proceed.");
      return { success: false, error: "Time input not found" };
    }

    await delay(1500);

    // 5. Final Click (v18: 3 attempts, global search)
    let finalScheduleClicked = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const allBtns = document.querySelectorAll('div[role="button"], button');
      const finalBtn = Array.from(allBtns).find(el => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || "").toLowerCase().trim();
        return t === "schedule send" || t === "schedule";
      });
      if (finalBtn) {
        finalBtn.click();
        finalScheduleClicked = true;
        log("Final Schedule send clicked.");
        break;
      }
      await delay(1000);
    }

    if (!finalScheduleClicked) {
      logError("Final schedule send button not found.");
      return { success: false, error: "Final confirm button not found" };
    }

    return { success: true };
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

  function buildComposeHash(email, subject) {
    const to = String(email || "").trim();
    const su = String(subject || "").trim();
    let hash = "#inbox?compose=new";
    if (to) {
      hash += "&to=" + encodeURIComponent(to);
    }
    if (su) {
      hash += "&su=" + encodeURIComponent(su);
    }
    return hash;
  }

  async function triggerComposeShortcutAndWait() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "c", code: "KeyC", bubbles: true }));
      await delay(1200);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function ensureComposeReady(maxWait, email, subject, allowComposeClick) {
    const totalWait = Math.max(maxWait || 12000, 12000);
    const perAttemptWait = Math.max(Math.floor(totalWait / 3), 4000);

    for (let attempt = 1; attempt <= 3; attempt++) {
      let composeRoot = pickComposeRoot(email, subject);
      if (composeRoot) {
        return composeRoot;
      }

      const composeRoute = isComposeHashRoute();
      if (allowComposeClick !== false) {
        const composeBtn = findComposeButton();
        if (composeBtn) {
          try {
            composeBtn.click();
            log("Clicked Compose to open draft (attempt " + attempt + ")");
          } catch (e) {
            logError("Compose click failed:", e.message);
          }
        }

        if (!composeRoute) {
          const targetHash = buildComposeHash(email, subject);
          if ((window.location.hash || "") !== targetHash) {
            window.location.hash = targetHash;
            log("Navigated to compose hash (attempt " + attempt + ")");
          }
        }

        await triggerComposeShortcutAndWait();
      } else if (!composeRoute) {
        const targetHash = buildComposeHash(email, subject);
        if ((window.location.hash || "") !== targetHash) {
          window.location.hash = targetHash;
          log("Navigated to compose hash without click (attempt " + attempt + ")");
        }
      } else {
        log("Compose route detected; waiting for draft UI (attempt " + attempt + ")");
      }

      await waitForBodyElement(perAttemptWait, null);
      composeRoot = pickComposeRoot(email, subject);
      if (composeRoot) {
        return composeRoot;
      }
    }

    return null;
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
      'button[aria-label="Reply"]',
      'button[data-tooltip="Reply"]',
      '[data-tooltip="Reply"]',
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
      if (label === "reply" || (label.startsWith("reply") && label !== "reply to all")) {
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
      .map(function (token) { return token.trim(); })
      .filter(function (token) { return token.length >= 4; })
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

  function isBounceSender(email) {
    const e = String(email || "").toLowerCase();
    return e === "mailer-daemon@googlemail.com" || e.indexOf("mailer-daemon") !== -1 || e.indexOf("postmaster") !== -1;
  }

  function hasBounceIndicators() {
    const text = (document.body && document.body.innerText) || "";
    // Common Gmail bounce indicators
    const patterns = [
      /Address not found/i,
      /Message not delivered/i,
      /Delivery Status Notification \(Failure\)/i,
      /The response from the remote server was/i,
      /couldn't be found\. Check for typos/i
    ];
    return patterns.some(p => p.test(text));
  }

  function extractThreadReplyBody(recipientEmail) {
    const expected = normalizeEmailValue(recipientEmail);
    const messageNodes = document.querySelectorAll(".adn");

    for (let i = 0; i < messageNodes.length; i++) {
      const node = messageNodes[i];
      const senderEl = node.querySelector(".gD[email]");
      if (!senderEl) continue;

      const senderEmail = (senderEl.getAttribute("email") || senderEl.getAttribute("data-hovercard-id") || "").trim().toLowerCase();
      const normalizedSender = normalizeEmailValue(senderEmail);

      const recipients = recipientEmail.split(",").map(e => normalizeEmailValue(e)).filter(e => !!e);
      const isMatch = recipients.some(r => normalizedSender === r || normalizedSender.includes(r));

      if (isMatch) {
        // Find the actual message payload inside this sender's block
        const bodyEl = node.querySelector(".ii.gt, .a3s.aiL");
        if (bodyEl) {
          // Clone it so we can strip out quoted text blocks to keep it clean
          const clone = bodyEl.cloneNode(true);
          const quotes = clone.querySelectorAll(".gmail_quote, .gmail_signature");
          quotes.forEach(q => q.remove());

          return clone.innerText.trim();
        }
      }
    }
    return null;
  }

  async function waitForRecipientSender(recipientEmail, timeoutMs) {
    const expected = normalizeEmailValue(recipientEmail);
    const timeout = timeoutMs || 15000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const senders = getThreadSenderEmails();
      if (senders.length > 0) {
        // Check for bounce first
        const bounced = senders.some(isBounceSender) || hasBounceIndicators();
        if (bounced) {
          log("Bounce detected in thread for:", recipientEmail);
          return { replied: false, bounced: true, senders: senders };
        }

        const recipients = recipientEmail.split(",").map(e => normalizeEmailValue(e)).filter(e => !!e);
        const matched = senders.some(function (sender) {
          const s = normalizeEmailValue(sender);
          return recipients.some(r => s === r || s.includes(r));
        });

        if (matched) {
          const replyBody = extractThreadReplyBody(recipientEmail);
          return { replied: true, bounced: false, senders: senders, replyBody: replyBody };
        }
      }
      await delay(600);
    }

    return { replied: false, bounced: false, senders: getThreadSenderEmails() };
  }

  async function checkThreadReply(data) {
    const threadId = String((data && data.threadId) || "").trim().replace(/^#+/, "");
    const recipientEmail = String((data && data.recipientEmail) || "").trim().toLowerCase();

    if (!threadId || !recipientEmail) {
      return { replied: false, bounced: false, senders: [], replyBody: null };
    }

    const currentHash = (window.location.hash || "").replace(/^#+/, "");
    if (currentHash.indexOf(threadId) === -1) {
      window.location.hash = "#all/" + threadId;
      await delay(2800);
    }

    const text = (document.body && document.body.innerText) || "";
    if (/conversation that you requested no longer exists/i.test(text)) {
      return { replied: false, bounced: false, senders: [], replyBody: null };
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

  async function updateLead(leadId, to, subject, body, threadId, sentGmailAuthUser) {
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
        body: body || "",
        sentGmailAuthUser: sentGmailAuthUser || ""
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
      log("Requesting tab closure");
      // Kill beforeunload prompt
      if (typeof window !== "undefined") {
        window.onbeforeunload = null;
      }
      await chrome.runtime.sendMessage({ action: "closeCurrentTab" });
    } catch (_) {
      try { window.close(); } catch(__) {}
    }
  }

  async function fillAndSend(data) {
    let to = data.to || "";
    let subject = data.subject || "";
    const body = data.body || "";
    const customSignatureText = String(data.customSignature || "");
    const customSignatureHtml = formatCustomSignatureHtml(customSignatureText);
    const templateHasSignature = !!data.templateHasSignature;
    const leadId = data.leadId || "";
    const isFollowup = !!data.isFollowup;
    const openReply = !!data.openReply;
    const threadIdForUrl = (data.threadIdForUrl || "").trim();
    const expectedGmailAuthUser = normalizeAuthUser(data.expectedGmailAuthUser || "");
    const gmailBaseUrl = getGmailBaseUrl(expectedGmailAuthUser || getCurrentAuthUser() || "0");
    const autoSend = data.autoSend !== false;
    const requireThreadReply = isFollowup && openReply;

    log("Starting fill and send", isFollowup ? "(follow-up)" : "", openReply ? "(reply in thread)" : "");

    // Wait longer for Gmail to settle redirects and render the profile button
    // Increased to 6s for slow loads
    await delay(openReply ? 6000 : 3500);

    let currentAuthUser = getCurrentAuthUser();
    let currentAccountEmail = getCurrentAccountEmail();

    // MATCHING STRATEGY (DEFINITIVE):
    // 1. If we are at a non-zero numeric index (u/1, u/2, etc.) -> PROCEED.
    //    Gmail automatically maps u/email/ to u/N/. If we are at N > 0, we trust Gmail got it right.
    // 2. If we are at u/0 -> We only redirect if we have NOT already tried redirecting in this session.
    // 3. If we are already at u/email@... -> PROCEED (it will likely redirect itself soon).

    const urlIsEmail = currentAuthUser.includes("@");
    const urlIsZero = (currentAuthUser === "0");
    const urlIsNonZeroIndex = !urlIsEmail && !urlIsZero && currentAuthUser !== "";

    let shouldRedirect = false;
    let redirectReason = "";

    if (urlIsZero && expectedGmailAuthUser !== "0" && expectedGmailAuthUser !== "") {
      shouldRedirect = true;
      redirectReason = "At u/0 but expected specific account";
    }

    // If we have UI email, and it SPECIFICALLY mismatches (double check)
    if (currentAccountEmail && !isExpectedAuthUser(currentAccountEmail, expectedGmailAuthUser)) {
       // Only redirect if we are at u/0 or if we are at a DIFFERENT email URL
       if (urlIsZero || urlIsEmail) {
         shouldRedirect = true;
         redirectReason = "UI Email mismatch (" + currentAccountEmail + " vs " + expectedGmailAuthUser + ")";
       }
    }

    // ANTI-LOOP CHECK: Have we already tried to redirect this specific lead in this tab session?
    const redirectKey = "redirect_tried_" + leadId;
    if (shouldRedirect && sessionStorage.getItem(redirectKey)) {
      log("Already tried redirecting for this lead. Aborting redirect to avoid loop.");
      shouldRedirect = false;
    }

    if (shouldRedirect) {
      log("Redirecting:", redirectReason, "To:", expectedGmailAuthUser);
      sessionStorage.setItem(redirectKey, "true");
      
      const hash = window.location.hash || "";
      // CRITICAL: Prevent encodes of @ symbols in the /u/ section!
      const encodedAccount = encodeURIComponent(expectedGmailAuthUser).replace(/%40/g, "@");
      const targetUrl = "https://mail.google.com/mail/u/" + encodedAccount + "/" + (hash || "#inbox");
      
      log("Executing redirect to:", targetUrl);
      window.location.href = targetUrl;
      return;
    }

    log("Session verified or trusted. Current URL Auth:", currentAuthUser, "UI Email:", currentAccountEmail || "unknown", "Proceeding.");

    function hasConversationNoLongerExistsError() {
      const text = (document.body && document.body.innerText) || "";
      return /conversation that you requested no longer exists/i.test(text) ||
        /conversation that you requested could not be loaded/i.test(text);
    }

    if (openReply) {
      if (hasConversationNoLongerExistsError()) {
        log("Thread not found (conversation no longer exists); opening new compose");
        const composeUrl = gmailBaseUrl + "#inbox?compose=new" +
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
            const composeUrl = gmailBaseUrl + "/#inbox?compose=new" +
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

    let composeRoot = await ensureComposeReady(22000, to, subject, !requireThreadReply);
    let recoveredViaComposeUrl = false;
    if (!composeRoot && !requireThreadReply) {
      log("Compose window not ready; trying explicit compose URL recovery");
      const recovered = await reopenComposeWithPrefilledRecipient(to, subject);
      if (recovered && recovered.composeRoot) {
        composeRoot = recovered.composeRoot;
        recoveredViaComposeUrl = !!recovered.filled;
      }
    }
    if (!composeRoot) {
      composeRoot = await ensureComposeReady(30000, to, subject, true);
    }
    if (!composeRoot) {
      logError("Compose window is not ready");
      return;
    }

    // Fill To
    let toFilled = requireThreadReply || recoveredViaComposeUrl;
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
      const cleanedBody = removeTrailingNameAfterSignoff(body, templateHasSignature);
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

    if (isFollowup) {
      log("Validating follow-up eligibility with background before sending...");
      try {
        const resData = await chrome.runtime.sendMessage({ action: "validateFollowup", data: { leadId } });

        if (!resData || !resData.success || !resData.eligible) {
          logError("Pre-send validation failed. Lead is no longer eligible for a follow-up:", (resData && resData.error) || "Already Followed Up / Replied");
          try {
            await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.to, error: "Follow-up no longer eligible (already sent or replied)" } });
          } catch (e) { }
          await closeCurrentAutomationTab();
          return;
        }
        log("Lead validation passed. Eligible for follow-up.");
      } catch (err) {
        logError("Failed to reach pre-send validation via background, proceeding anyway:", err.message);
      }

      // Safeguard: Check if we are accidentally replying to a mail-daemon or postmaster bounce email
      try {
        const toTags = composeRoot.querySelectorAll(".agP.aFw, .vR .vN");
        let foundBounceDaemon = false;
        toTags.forEach(tag => {
          const emailText = (tag.getAttribute("email") || tag.getAttribute("data-hovercard-id") || tag.textContent || "").toLowerCase();
          if (emailText.includes("mailer-daemon") || emailText.includes("postmaster") || emailText.includes("no-reply")) {
            foundBounceDaemon = true;
          }
        });

        if (foundBounceDaemon) {
          logError("Pre-send validation failed. Detected bounce daemon in the 'To' field. Aborting follow-up.");
          try {
            await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.to, error: "Auto-aborted: Attempted to reply to mailer-daemon bounce message" } });

            // Mark the lead as replied or failed on backend so it stops trying
            await chrome.runtime.sendMessage({
              action: "updateLeadStatus",
              data: {
                leadId: leadId,
                recipientEmail: data.to,
                status: "failed",
                error: "Bounced: mailer-daemon reply prevented"
              }
            });
          } catch (e) { }
          await closeCurrentAutomationTab();
          return;
        }
      } catch (e) {
        logError("Error checking 'To' tags for bounce daemon:", e);
      }
    }



    if (autoSend) {
      if (!toFilled) {
        logError("Auto send aborted: recipient not confirmed");
        try {
          await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.to, error: "Recipient not confirmed" } });
        } catch (e) { }
        return;
      }

      log("(v19) SCHEDULE DIAGNOSTIC: data.scheduleSendTime =", JSON.stringify(data.scheduleSendTime), "typeof =", typeof data.scheduleSendTime, "autoSend =", autoSend);

      // Fallback: if scheduleSendTime is empty, try reading from chrome.storage.local
      let effectiveScheduleTime = (data.scheduleSendTime || "").trim();
      if (!effectiveScheduleTime) {
        try {
          const stored = await chrome.storage.local.get("pendingScheduleSendTime");
          if (stored && stored.pendingScheduleSendTime) {
            effectiveScheduleTime = String(stored.pendingScheduleSendTime).trim();
            log("(v19) FALLBACK: Read scheduleSendTime from chrome.storage.local:", effectiveScheduleTime);
          }
        } catch (e) {
          logError("(v19) Failed to read pendingScheduleSendTime from storage:", e);
        }
      }
      // Clear the stored value after reading to prevent reuse on next send
      try {
        await chrome.storage.local.remove("pendingScheduleSendTime");
      } catch (e) { }

      if (effectiveScheduleTime) {
        log(`Attempting Schedule Send at ${effectiveScheduleTime}`);
        const scheduleResult = await clickScheduleSendButton(composeRoot, bodyEl, effectiveScheduleTime);
        if (!scheduleResult.success) {
          const errMsg = scheduleResult.error || "Failed to click schedule send UI";
          logError(`Schedule Send Failed: ${errMsg}`);
          // Notify background script about failure
          try {
            await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.to, error: errMsg } });
          } catch (e) { }
          return; // Leave as draft
        }
        log("Schedule send triggered, waiting 3s to let UI settle");
        await delay(3000);
        // We successfully scheduled it, so we must tell the dashboard it's "Sent" (Scheduled)
        await updateLead(leadId, to, subject, body, null, expectedGmailAuthUser);
        log("Lead updated after schedule send");
        await closeCurrentAutomationTab();
        return;
      } else {
        const sendBaseline = {
          hadMessageSent: getSendStatusText() === "message sent",
          viewCount: countViewMessageControls()
        };
        const clicked = clickSendButton(composeRoot, bodyEl);
        if (!clicked) {
          logError("Auto send failed: Send button not found");
          try {
            await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.to, error: "Send button not found" } });
          } catch (e) { }
          return;
        }
        log("Auto send triggered, waiting for completion");
        const sendCompleted = await waitForSendCompletion(60000, sendBaseline);
        if (!sendCompleted) {
          log("Auto send completion was not detected before timeout");
          try {
            await chrome.runtime.sendMessage({ action: "sendScheduleError", data: { email: data.email, error: "Send completion timeout" } });
          } catch (e) { }
          return;
        }
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
        const sentAuthUser = getSenderIdentityForStorage(expectedGmailAuthUser);
        const response = await chrome.runtime.sendMessage({
          action: "updateFollowup",
          data: { leadId: leadId, sentGmailAuthUser: sentAuthUser || "" },
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
      // Wait 3s to let Gmail settle and avoid beforeunload prompt
      await delay(3000);
      await closeCurrentAutomationTab();
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
      await updateLead(leadId, to, subject, body, threadId, getSenderIdentityForStorage(expectedGmailAuthUser));
    }

    log("Manual send flow completed");
    await closeCurrentAutomationTab();
  }

  log("Content script loaded", SCRIPT_VERSION);
})();
