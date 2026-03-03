/**
 * Content script: Leads Dashboard
 * Listens for Send button clicks, extracts row data, starts workflow via background.
 */

(function () {
  "use strict";

  // Table columns: 1=Campaign, 2=Recipient Name, 3=Recipient Email, 4=Website, 5=Niche, 6=Status (merged with step), 7=Sent At, 8=Created At, 9=Actions

  function getCellText(row, selector) {
    try {
      const el = row.querySelector(selector);
      return el ? (el.textContent || "").trim() : "";
    } catch {
      return "";
    }
  }

  function findSendButton(row) {
    const buttons = row.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === "Send" && !btn.disabled) return btn;
    }
    return null;
  }

  function getStepFromRow(row) {
    const stepCell = row.querySelector("td:nth-child(6)");
    if (stepCell) {
      const dataStep = stepCell.getAttribute("data-step");
      if (dataStep) {
        const n = parseInt(dataStep, 10);
        if (!isNaN(n)) return n;
      }
    }
    const stepText = getCellText(row, "td:nth-child(6)");
    const labels = { "Follow up 1": 2, "Follow up 2": 3, "Sent": 1, "Replied": 1, "Pending": 1 };
    return labels[stepText] ?? 1;
  }

  function extractRowData(row) {
    const campaignEl = row.querySelector("td:first-child a");
    const campaignName = campaignEl ? (campaignEl.textContent || "").trim() : getCellText(row, "td:nth-child(1)");
    const recipientName = getCellText(row, "td:nth-child(2)");
    const recipientEmail = getCellText(row, "td:nth-child(3)");
    const websiteUrl = getCellText(row, "td:nth-child(4)");
    const niche = getCellText(row, "td:nth-child(5)");
    const step = getStepFromRow(row);
    const campaignBody = (row.getAttribute("data-campaign-body") || "").trim();
    const campaignSubject = (row.getAttribute("data-campaign-subject") || "").trim();
    return {
      campaignName,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl === "—" ? "" : websiteUrl,
      niche: niche === "—" ? "" : niche,
      website: websiteUrl === "—" ? "" : websiteUrl,
      step,
      campaignBody,
      campaignSubject,
    };
  }

  function attachListeners() {
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      const sendBtn = findSendButton(row);
      if (!sendBtn || sendBtn.dataset.leadsExtensionBound) return;
      sendBtn.dataset.leadsExtensionBound = "1";
      sendBtn.addEventListener(
        "click",
        async (e) => {
          const recipientEmail = getCellText(row, "td:nth-child(3)");
          if (!recipientEmail) {
            console.warn("[Leads Extension] No recipient email in row");
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const data = extractRowData(row);
          log("Dashboard", "Send clicked, data:", data);
          try {
            chrome.runtime.sendMessage({
              action: "startWorkflow",
              data,
            });
          } catch (err) {
            logError("Dashboard", err);
          }
        },
        true
      );
    });
  }

  function init() {
    log("Dashboard", "Content script loaded");
    attachListeners();
    setTimeout(attachListeners, 500);
    setTimeout(attachListeners, 1500);
    const observer = new MutationObserver(() => {
      attachListeners();
    });
    const table = document.querySelector("table tbody");
    if (table) observer.observe(table, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
