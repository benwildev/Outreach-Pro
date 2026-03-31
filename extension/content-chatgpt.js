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
    const websiteUrl = (message.websiteUrl || "").trim();

    // If the prompt doesn't already contain scraped company context (background.js
    // may have already injected it), try to enrich it here as a secondary pass.
    // This is a non-blocking, best-effort call — any failure falls back silently.
    async function enrichAndRun() {
      let enrichedPrompt = message.prompt;
      // Use the title already scraped by background.js (if any) as our base site title.
      // enrichAndRun will override it below if it does its own scrape.
      let scrapedSiteTitle = (message.websiteContextTitle || "").trim();
      if (websiteUrl && !enrichedPrompt.includes("Company context")) {
        try {
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "scrapeWebsite", url: websiteUrl }, resolve);
          });
          if (resp && resp.success && resp.data) {
            const ctx = resp.data;
            scrapedSiteTitle = ctx.title || "";
            const parts = [];
            if (ctx.title)      parts.push("- Business name / page title: " + ctx.title);
            if (ctx.description) parts.push("- What they do: " + ctx.description);
            if (ctx.firstPara)  parts.push("- Site excerpt: " + ctx.firstPara);
            if (parts.length > 0) {
              enrichedPrompt += "\n\nCompany context (use this to personalise the email — reference something specific):\n" + parts.join("\n");
              log("ChatGPT", "Injected website context from scrape:", ctx.title || "(no title)");
            }
          }
        } catch (_) { /* non-fatal */ }
      }
      return runPasteAndSend(
        enrichedPrompt,
        recipientName,
        message.recipientEmail,
        message.leadId,
        templateHasSignature,
        signatureBlock,
        campaignSignature,
        scrapedSiteTitle
      );
    }

    enrichAndRun()
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

  async function runPasteAndSend(prompt, recipientName, recipientEmail, leadId, templateHasSignature, signatureBlock, campaignSignature, siteTitle) {
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

    // Wait up to 3s for the send button to become enabled after text is injected.
    let sendBtn = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      sendBtn = document.querySelector('button[data-testid="send-button"]:not([disabled])')
        || document.querySelector('button[aria-label="Send message"]:not([disabled])')
        || Array.from(document.querySelectorAll('button')).find((b) => {
          if (b.disabled) return false;
          const label = (b.getAttribute("aria-label") || "").toLowerCase();
          return label.includes("send") && !label.includes("stop");
        });
      if (sendBtn) break;
      await delay(500);
    }

    if (sendBtn) {
      sendBtn.click();
      log("ChatGPT", "Send button clicked");
    } else {
      // Reliable fallback: Enter key, which always works in ChatGPT regardless of button state.
      log("ChatGPT", "Send button not found or disabled, using Enter key fallback");
      const submitBtn = document.querySelector('form button[type="submit"]:not([disabled])')
        || document.querySelector('button[type="submit"]:not([disabled])');
      if (submitBtn) {
        submitBtn.click();
      } else {
        textarea.focus();
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        await delay(100);
        textarea.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
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
      siteTitle: siteTitle || "",
    });

    if (isPlaceholderOnlyValue(subject, "subject") || isPlaceholderOnlyValue(body, "body")) {
      logError("ChatGPT", "Placeholder template output detected; skipping handoff to Gmail");
      return { success: false, error: "Model returned placeholder template text" };
    }

    // Prompt-echo guard: if the first ~60 chars of the body appear in the first 400 chars
    // of the original prompt, ChatGPT echoed our instructions instead of writing an email.
    // This prevents the raw campaign template from being sent to the recipient.
    if (body && prompt) {
      const bodyLead = body.replace(/\s+/g, " ").trim().slice(0, 70).toLowerCase();
      const promptHead = prompt.replace(/\s+/g, " ").trim().slice(0, 400).toLowerCase();
      if (bodyLead.length > 20 && promptHead.includes(bodyLead)) {
        logError("ChatGPT", "Prompt echo detected — body matches prompt instructions. Aborting send.");
        return { success: false, error: "ChatGPT returned prompt content as email body" };
      }
    }

    // Also reject if the body doesn't start with a typical email greeting
    // AND contains instruction-like patterns (bullet points, 'suggest', 'strictly follow')
    if (body && !/^(hi|hello|dear|hey)\s+\S/i.test(body.trim())) {
      const lowerBody = body.toLowerCase();
      const hasInstructionPattern = (
        lowerBody.includes("strictly follow") ||
        lowerBody.includes("deeply browse") ||
        /^\s*\*\s*(suggest|write|include|provide)/m.test(lowerBody)
      );
      if (hasInstructionPattern) {
        logError("ChatGPT", "Body contains instruction/prompt content — not a real email. Aborting.");
        return { success: false, error: "ChatGPT returned instruction text as email body" };
      }
    }

    // Minimum content quality guard:
    // Strip the greeting (first line) and signature block, then check that what
    // remains is substantial enough to be a real outreach email.
    // This catches cases where ChatGPT just wrote the company name or a single
    // sentence with no actual pitch content.
    const bodyForQualityCheck = (function (raw) {
      const lines = raw.split("\n");
      let start = 0;
      let end = lines.length;
      // Skip leading greeting line
      if (lines.length > 0 && /^(hi|hello|dear|hey)\s+\S/i.test(lines[0].trim())) {
        start = 1;
      }
      // Skip trailing signature block (Best regards … name lines)
      for (let i = lines.length - 1; i > start; i--) {
        const l = lines[i].trim();
        if (/^(best(?: regards)?|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/i.test(l)) {
          end = i;
          break;
        }
      }
      return lines.slice(start, end).join("\n").trim();
    })(body);

    const bodyWordCount = bodyForQualityCheck.split(/\s+/).filter(function (w) { return w.length > 0; }).length;
    const MIN_WORDS = 25;
    const MIN_CHARS = 120;

    if (bodyWordCount < MIN_WORDS || bodyForQualityCheck.length < MIN_CHARS) {
      logError(
        "ChatGPT",
        "Email body too short — " + bodyWordCount + " words / " + bodyForQualityCheck.length +
        " chars (need " + MIN_WORDS + " words & " + MIN_CHARS + " chars). Aborting send. Will retry next run."
      );
      return { success: false, error: "Email body too short — ChatGPT did not generate enough content" };
    }

    log("ChatGPT", "Parsed subject length:", subject.length, "body length:", body.length, "content words:", bodyWordCount);

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
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      // Use the native value setter so React's synthetic event system recognises the change.
      try {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")
          || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (nativeSetter && nativeSetter.set) {
          nativeSetter.set.call(el, text);
        } else {
          el.value = text;
        }
      } catch (_) {
        el.value = text;
      }
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
    // Cover both old ("Stop generating") and new ("Stop streaming") ChatGPT UI labels.
    const stopSelectors = [
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop"]',
    ];
    for (const sel of stopSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) return true;
    }
    const buttons = document.querySelectorAll("button");
    for (const b of buttons) {
      const text = (b.textContent || "").trim();
      if (text === "Stop generating" || text === "Stop streaming" || text === "Stop") return true;
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
        'sup', 'button', 'svg',
        '[class*="citation" i]', '[class*="source" i]', '[class*="reference" i]',
        'span.flex.items-center.justify-center',
        'a[href*="google.com/search"]', 'a[href*="bing.com/search"]',
        '.text-xs', '.rounded-full', '.rounded-md', '.bg-token-main-surface-secondary',
        '[contenteditable="false"]',
        '[aria-label*="citation" i]', '[aria-label*="source" i]'
      ].join(', '));
      for (let j = 0; j < noise.length; j++) {
        const el = noise[j];
        if (el && el.parentNode) {
           el.parentNode.removeChild(el);
        }
      }
      const links = clone.querySelectorAll('a');
      for (let j = 0; j < links.length; j++) {
        const text = (links[j].innerText || links[j].textContent || "").trim();
        // If it looks like a citation link (short, maybe at the end of a sentence or in a pill)
        // ChatGPT often uses very short titles or domain-like names for sources.
        const isCitation = text.length < 30 && (
          links[j].className.match(/citation|source|reference/i) || 
          links[j].getAttribute('data-testid')?.match(/citation|source/i) ||
          links[j].href.includes('muckrack.com') || // specific common sources
          links[j].href.includes('morningadvertiser.co.uk')
        );

        if (isCitation) {
           if (links[j].parentNode) links[j].parentNode.removeChild(links[j]);
           continue;
        }

        const textNode = document.createTextNode(links[j].innerText || links[j].textContent || "");
        if (links[j].parentNode) links[j].parentNode.replaceChild(textNode, links[j]);
      }
      
      // Ensure bullet points are not lost when converting HTML lists to plain text
      const listItems = clone.querySelectorAll('li');
      for (let j = 0; j < listItems.length; j++) {
        // Skip outer list items that contain nested lists to avoid double-bulleting
        if (!listItems[j].querySelector('ul') && !listItems[j].querySelector('ol')) {
          // Drill down past container tags so the bullet is placed inline with the text (avoids newline split)
          let target = listItems[j];
          while (target.firstElementChild && ['P', 'DIV', 'SPAN'].includes(target.firstElementChild.tagName)) {
            target = target.firstElementChild;
          }
          const text = String(target.innerText || target.textContent || "").trim();
          if (!text.startsWith("•") && !text.startsWith("-")) {
            target.insertBefore(document.createTextNode("\u2022 "), target.firstChild);
          }
        }
      }

      let rawText = String(clone.innerText || clone.textContent || "").trim();

      // ChatGPT's "Email card" UI uses CSS display:block on <span> elements.
      // When the node is cloned out-of-document, CSS is lost and innerText treats
      // them as inline — everything runs together with no line breaks at all.
      // Fix: if the clone has no newlines but the live (in-document) element does,
      // the clone lost CSS-dependent layout. Fall back to the live innerText and
      // strip only the chat UI action-button noise with regex.
      const liveText = String(node.innerText || "").trim();
      if (liveText.length > 30 && liveText.includes("\n") && !rawText.includes("\n")) {
        rawText = liveText
          .replace(/\n(Copy|Edit|Read aloud|Thumb up|Thumb down|Share|Regenerate|Browse|More)\n/gi, "\n")
          .replace(/\n(Copy|Edit|Read aloud|Thumb up|Thumb down|Share|Regenerate|Browse|More)$/im, "");
      }

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
      const softResolveAfterMs = 25000;

      function looksLikeEmailOutput(text) {
        if (!text || text.length < 40) return false;
        if (/(?:^|\n)\s*\*{0,2}subject\*{0,2}\s*[:\-]/i.test(text)) return true;
        if (/(?:^|\n)\s*subject\s+(?:option|line)\s*\d+\s*:/i.test(text)) return true;
        if (/(?:^|\n)\s*\*{0,2}(?:email\s+)?body\*{0,2}\s*[:\-]/i.test(text)) return true;
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
  function isMetaLine(line) {
    const v = String(line || "").trim();
    // "Email" standalone (ChatGPT card-format header — no colon, just the word)
    if (/^email$/i.test(v)) return true;
    return /^\*{0,2}(subject(\s+(option|line)\s*\d+)?|body|email\s*body|suggested\s+subject\s+lines?|email)\*{0,2}\s*[:\-]/i.test(v);
  }

  // Remove anything ChatGPT appended after the email signature.
  // Finds the LAST stand-alone sign-off line ("Best regards,", "Thanks,", etc.),
  // allows up to 4 non-empty lines after it for the name/title/company block,
  // then cuts everything else (alternative subject suggestions, commentary, etc.).
  function trimPostSignatureChatter(text) {
    if (!text) return text;
    const lines = text.split("\n");
    // Matches a BARE sign-off line — just the word/phrase, nothing else on the line.
    // "Best regards," → match. "Thanks for your time." → no match (has trailing text after "Thanks").
    const signoffRe = /^(best\s+regards?|warm\s+regards?|kind\s+regards?|many\s+thanks|best|sincerely|cheers|thanks|thank\s+you|with\s+(?:warm\s+)?regards?|yours?\s+(?:truly|sincerely)?|looking\s+forward)[,.]?\s*$/i;
    // A line is part of the signature block (name / title / company / contact) when it:
    //   - is short (≤60 chars)
    //   - does NOT end with ":" (which introduces a list / alternative options)
    //   - does NOT end with sentence punctuation (period, !, ?)
    //   - does NOT start with a bullet or dash
    //   - does NOT contain ChatGPT commentary keywords
    const isSignatureLine = (l) =>
      l.length <= 60 &&
      !/:\s*$/.test(l) &&
      !/[.!?]$/.test(l) &&
      !/^[•\-*]/.test(l) &&
      !/\b(alternative|subject line|option|version|variation|let me know|feel free|hope this|here are|adjust|revis|chang)\b/i.test(l);

    let signoffIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (signoffRe.test(lines[i].trim())) {
        signoffIndex = i; // keep scanning — use the LAST match so mid-body "thanks" lines don't cut early
      }
    }
    if (signoffIndex === -1) return text;

    // Walk forward from the sign-off, collecting signature lines (name, title, company, contact).
    // Stop at the first line that looks like ChatGPT commentary OR after 4 non-empty sig lines.
    let end = signoffIndex + 1;
    let sigLines = 0;
    while (end < lines.length) {
      const l = lines[end].trim();
      if (l) {
        if (!isSignatureLine(l) || sigLines >= 4) break; // commentary or too many sig lines
        sigLines++;
      }
      end++;
    }
    return lines.slice(0, end).join("\n").trim();
  }

  function parseEmailResponse(text) {
    if (!text || typeof text !== "string") {
      return { subject: "", body: "" };
    }

    // Normalize ChatGPT Email card format before any parsing.
    // The card UI prepends "Email" (no colon) and uses "Subject  text" (spaces, no colon).
    // Also deduplicate subject lines that appear twice due to card UI rendering.
    let normalized = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    // Strip standalone "Email" card-header line at the very top
    normalized = normalized.replace(/^Email\s*\n/i, "");
    // Normalize "Subject  text" (2+ spaces or tab, no colon) → "Subject: text"
    normalized = normalized.replace(/(?:^|\n)([ \t]*)Subject([ \t]{2,}|\t)([^\n]+)/gi, "\n$1Subject: $3");
    // If the subject line appears twice back-to-back (card shows it in two places), deduplicate
    normalized = normalized.replace(/(Subject:[^\n]+)\n\1/gi, "$1");
    // Ensure greeting line has a blank line before it if needed
    normalized = normalized.replace(/([^\n])\n((?:Hi|Hello|Dear|Hey)\s+[A-Za-z])/g, "$1\n\n$2");

    const trimmed = normalized.trim();

    // --- Body extraction (try labeled sections first) ---
    const bodyPatterns = [
      /(?:^|\n)\s*\*{0,2}(?:email\s+)?body\*{0,2}\s*:\s*([\s\S]*)$/i,
      /(?:^|\n)\s*email\s*:\s*([\s\S]*)$/i,
    ];
    let body = "";
    for (let i = 0; i < bodyPatterns.length; i++) {
      const m = trimmed.match(bodyPatterns[i]);
      if (m && m[1] && m[1].trim().length > 20) {
        body = m[1].trim();
        break;
      }
    }

    // Strip card-header preamble that ChatGPT's "Email" card format inserts before
    // the real greeting (e.g. "Email\nSubject  News angles...\n\nHi Recipient,").
    // If the extracted body doesn't start with a greeting, look for the first
    // greeting line inside it and use everything from there.
    if (body && !/^(hi|hello|dear|hey)\s+\S/i.test(body.trim())) {
      var bodyLines = body.split("\n");
      var greetingInBody = -1;
      for (var gi = 0; gi < bodyLines.length; gi++) {
        if (/^(hi|hello|dear|hey)\s+\S/i.test(bodyLines[gi].trim())) {
          greetingInBody = gi;
          break;
        }
      }
      if (greetingInBody > 0) {
        log("ChatGPT", "Stripped card-header preamble (" + greetingInBody + " lines) from extracted body");
        body = bodyLines.slice(greetingInBody).join("\n").trim();
      }
    }

    // If no labeled body found, look for where the actual email greeting starts
    // (e.g. "Hi Amanda," / "Hello Joyce," / "Dear Amanda,") — that is the real email body.
    if (!body) {
      const lines = trimmed.split("\n");
      let greetingIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^(hi|hello|dear)\s+\S/i.test(lines[i].trim())) {
          greetingIndex = i;
          break;
        }
      }
      if (greetingIndex !== -1) {
        body = lines.slice(greetingIndex).join("\n").trim();
      } else {
        // Last resort: strip all known meta-lines and use the rest
        const filtered = lines.filter((line) => {
          const l = line.trim();
          if (!l) return false;
          return !isMetaLine(l);
        });
        body = filtered.join("\n").trim();
      }
    }

    // --- Subject extraction ---
    const subjectPatterns = [
      /(?:^|\n)\s*\*{0,2}subject\*{0,2}\s*:\s*(.+?)(?=\n|$)/i,
      /(?:^|\n)\s*subject\s+(?:option|line)\s*1\s*:\s*(.+?)(?=\n|$)/i,
      /(?:^|\n)\s*subject\s*[-–]\s*(.+?)(?=\n|$)/i,
      /(?:^|\n)\s*title\s*:\s*(.+?)(?=\n|$)/i,
    ];
    let subject = "";
    for (let i = 0; i < subjectPatterns.length; i++) {
      const m = trimmed.match(subjectPatterns[i]);
      if (m && m[1]) {
        subject = m[1].replace(/[*_`]/g, "").trim();
        break;
      }
    }

    // Strip anything ChatGPT appended after the email signature block.
    // e.g. "Two alternative subject lines: ..." or "Let me know if you'd like changes."
    // Strategy: find the last stand-alone sign-off line (e.g. "Best regards,"),
    // keep up to 4 non-empty lines after it for the name/title/company signature,
    // then discard everything beyond that.
    body = trimPostSignatureChatter(body);

    if (isPromptEchoText(body)) {
      body = body
        .replace(/return output exactly in this format:[\s\S]*$/i, "")
        .replace(/<\s*email body only\s*>/ig, "")
        .trim();
    }

    if (isPlaceholderOnlyValue(subject, "subject")) subject = "";
    if (isPlaceholderOnlyValue(body, "body")) body = "";

    // Subject fallback: use the first short line of the body only if it looks like
    // a subject line (not a greeting, not a meta-label, not longer than 120 chars).
    if (!subject && body) {
      const firstLine = body.split("\n")[0].trim();
      const looksLikeGreeting = /^(hi|hello|dear)\s+/i.test(firstLine);
      if (firstLine && !looksLikeGreeting && !isMetaLine(firstLine) && firstLine.length <= 120) {
        subject = firstLine.replace(/[*_`]/g, "").trim();
      }
    }

    log("ChatGPT", "Parsed email - Subject:", subject.substring(0, 50), "| Body length:", body.length);

    return { subject, body };
  }

  log("ChatGPT", "Content script loaded");
})();
