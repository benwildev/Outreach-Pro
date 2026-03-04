/**
 * Content script: Leads Dashboard
 * Listens for Send button clicks, extracts row data, starts workflow via background.
 */

(function () {
  "use strict";

  // Table columns: 1=Campaign, 2=Recipient Name, 3=Recipient Email, 4=Website, 5=Niche,
  // 6=Status, 7=Thread ID, 8=Mail Data, 9=Sent Gmail, 10=Sent At, 11=Created At, 12=Actions
  const boundButtons = new WeakSet();
  let delegatedCheckReplyBound = false;

  function hasRuntimeMessaging() {
    return (
      typeof chrome !== "undefined" &&
      !!chrome.runtime &&
      !!chrome.runtime.id &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function recoverRuntime(reason) {
    const reloadKey = "leadsExtensionRuntimeRecoveryAt";
    const now = Date.now();
    const lastReload = parseInt(sessionStorage.getItem(reloadKey) || "0", 10);

    if (now - lastReload > 10000) {
      sessionStorage.setItem(reloadKey, String(now));
      console.warn("[Leads Extension Dashboard]", reason, "Reloading dashboard tab to reattach extension runtime.");
      window.location.reload();
      return true;
    }

    logError("Dashboard", new Error(reason));
    return false;
  }

  function getCellText(row, selector) {
    try {
      const el = row.querySelector(selector);
      return el ? (el.textContent || "").trim() : "";
    } catch {
      return "";
    }
  }

  function findSendButton(row) {
    return row.querySelector('button[data-action="send"]:not([disabled])');
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
    const campaignId = (row.getAttribute("data-campaign-id") || "").trim();
    const campaignChatId = (row.getAttribute("data-campaign-chat-id") || "").trim();
    const campaignGmailAuthUser = (row.getAttribute("data-campaign-gmail-auth-user") || "").trim();
    const recipientName = getCellText(row, "td:nth-child(2)");
    const recipientEmail = getCellText(row, "td:nth-child(3)");
    const websiteUrl = getCellText(row, "td:nth-child(4)");
    const niche = getCellText(row, "td:nth-child(5)");
    const step = getStepFromRow(row);
    const campaignBody = (row.getAttribute("data-campaign-body") || "").trim();
    const campaignSubject = (row.getAttribute("data-campaign-subject") || "").trim();
    const followup1 = (row.getAttribute("data-followup1") || "").trim();
    const followup2 = (row.getAttribute("data-followup2") || "").trim();
    const gmailThreadId = (row.getAttribute("data-gmail-thread-id") || "").trim();
    const leadId = (row.getAttribute("data-lead-id") || "").trim();
    return {
      leadId,
      campaignId,
      campaignChatId,
      campaignGmailAuthUser,
      gmailThreadId,
      campaignName,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl === "—" ? "" : websiteUrl,
      niche: niche === "—" ? "" : niche,
      website: websiteUrl === "—" ? "" : websiteUrl,
      step,
      campaignBody,
      campaignSubject,
      followup1,
      followup2,
    };
  }

  function findFollowupButton(row) {
    return row.querySelector('button[data-action="followup"]:not([disabled])');
  }

  function findCheckReplyButton(row) {
    return row.querySelector('button[data-action="check-reply"]:not([disabled])');
  }

  async function handleCheckReplyClick(checkReplyBtn, row, event) {
    if (!checkReplyBtn) {
      return;
    }
    const data = row ? extractRowData(row) : {};
    const leadId = (data.leadId || checkReplyBtn.getAttribute("data-lead-id") || "").trim();
    const threadId = (data.gmailThreadId || checkReplyBtn.getAttribute("data-thread-id") || "").trim();
    const recipientEmail = (data.recipientEmail || checkReplyBtn.getAttribute("data-recipient-email") || "").trim();

    if (!leadId || !threadId || !recipientEmail) {
      console.warn("[Leads Extension] Missing lead/thread/recipient for reply check");
      return;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    if (!hasRuntimeMessaging()) {
      recoverRuntime("Extension runtime unavailable");
      return;
    }

    const prevDisabled = checkReplyBtn.disabled;
    checkReplyBtn.disabled = true;
    checkReplyBtn.setAttribute("aria-label", "Checking reply...");
    checkReplyBtn.setAttribute("title", "Checking reply...");
    checkReplyBtn.classList.add("opacity-60");

    try {
      const response = await chrome.runtime.sendMessage({
        action: "checkReplyByThread",
        data: {
          leadId: leadId,
          threadId: threadId,
          recipientEmail: recipientEmail,
          campaignGmailAuthUser: data.campaignGmailAuthUser || "",
        },
      });

      if (response && response.success && response.replied) {
        checkReplyBtn.setAttribute("aria-label", "Replied");
        checkReplyBtn.setAttribute("title", "Replied");
        checkReplyBtn.disabled = true;
        checkReplyBtn.classList.remove("opacity-60");
        return;
      }
    } catch (err) {
      logError("Dashboard", err);
    }

    checkReplyBtn.disabled = prevDisabled;
    checkReplyBtn.setAttribute("aria-label", "No reply found yet");
    checkReplyBtn.setAttribute("title", "No reply found yet");
    checkReplyBtn.classList.remove("opacity-60");
  }

  function getStepLabelFromLead(lead) {
    if (!lead) return "Sent";
    if (lead.replied || lead.status === "replied") return "Replied";
    if (lead.status === "pending") return "Pending";
    if (lead.step === 2) return "Follow up 1";
    if (lead.step === 3) return "Follow up 2";
    return "Sent";
  }

  function updateRowFromLead(lead) {
    if (!lead || !lead.id) {
      return;
    }

    const row = document.querySelector('tr[data-lead-id="' + lead.id + '"]');
    if (!row) {
      return;
    }

    const statusCell = row.querySelector("td:nth-child(6)");
    const threadCell = row.querySelector("td:nth-child(7)");
    const mailDataCell = row.querySelector("td:nth-child(8)");
    const sentGmailCell = row.querySelector("td:nth-child(9)");
    const sentAtCell = row.querySelector("td:nth-child(10)");
    const sendBtn = row.querySelector('button[data-action="send"]');
    const followupBtn = row.querySelector('button[data-action="followup"]');
    const checkReplyBtn = row.querySelector('button[data-action="check-reply"]');

    if (statusCell) {
      statusCell.setAttribute("data-step", String(lead.step || 1));
      const badge = statusCell.querySelector("[class]");
      if (badge) {
        badge.textContent = getStepLabelFromLead(lead);
      } else {
        statusCell.textContent = getStepLabelFromLead(lead);
      }
    }

    if (threadCell) {
      const threadId = lead.gmailThreadId || "";
      threadCell.textContent = threadId ? threadId.substring(0, 12) + "..." : "-";
      threadCell.setAttribute("title", threadId);
    }

    if (mailDataCell) {
      const subject = lead.sentSubject || "";
      const body = lead.sentBody || "";
      const hasPreviewButton = !!mailDataCell.querySelector('button[aria-label="Preview sent message"]');

      if (hasPreviewButton) {
        mailDataCell.setAttribute("title", subject);
      } else if (!body) {
        mailDataCell.textContent = "-";
        mailDataCell.removeAttribute("title");
      } else {
        // React preview button cannot be mounted from this content script patch.
        // Reload once so React renders the eye button in this row.
        const refreshKey = "leadsPreviewRefreshAt";
        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(refreshKey) || "0", 10);
        if (now - last > 8000) {
          sessionStorage.setItem(refreshKey, String(now));
          window.location.reload();
          return;
        }
      }
    }

    if (sentAtCell) {
      const sentAt = lead.sentAt ? new Date(lead.sentAt) : null;
      sentAtCell.textContent = sentAt && !Number.isNaN(sentAt.getTime())
        ? sentAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })
        : "-";
      sentAtCell.classList.add("whitespace-nowrap");
    }

    if (sentGmailCell) {
      sentGmailCell.textContent = lead.sentGmailAuthUser || "-";
    }

    if (lead.replied || lead.status === "replied") {
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.setAttribute("title", "Already replied");
      }
      if (followupBtn) {
        followupBtn.disabled = true;
        followupBtn.setAttribute("title", "Already replied");
      }
      if (checkReplyBtn) {
        checkReplyBtn.disabled = true;
        checkReplyBtn.setAttribute("title", "Replied");
      }
    }
  }

  function attachListeners() {
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      const sendBtn = findSendButton(row);
      if (sendBtn && !boundButtons.has(sendBtn)) {
        boundButtons.add(sendBtn);
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
            if (!hasRuntimeMessaging()) {
              recoverRuntime("Extension runtime unavailable");
              return;
            }
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
      }

      const followupBtn = findFollowupButton(row);
      if (followupBtn && !boundButtons.has(followupBtn)) {
        boundButtons.add(followupBtn);
        followupBtn.addEventListener(
        "click",
        async (e) => {
          const data = extractRowData(row);
          const recipientEmail = data.recipientEmail;
          if (!recipientEmail || !data.leadId) {
            console.warn("[Leads Extension] No recipient email or lead id in row");
            return;
          }
          const body = data.step === 1 ? data.followup1 : data.followup2;
          if (!body) {
            console.warn("[Leads Extension] No follow-up content for this step");
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (!hasRuntimeMessaging()) {
            recoverRuntime("Extension runtime unavailable");
            return;
          }
          try {
            chrome.runtime.sendMessage({
              action: "startFollowupWorkflow",
              data: {
                leadId: data.leadId,
                to: recipientEmail,
                subject: "Re: " + (data.campaignSubject || ""),
                body: body,
                threadId: data.gmailThreadId || null,
                campaignGmailAuthUser: data.campaignGmailAuthUser || "",
              },
            });
          } catch (err) {
            logError("Dashboard", err);
          }
        },
        true
        );
      }

      const checkReplyBtn = findCheckReplyButton(row);
      if (checkReplyBtn && !boundButtons.has(checkReplyBtn)) {
        boundButtons.add(checkReplyBtn);
        checkReplyBtn.addEventListener(
          "click",
          async (e) => {
            await handleCheckReplyClick(checkReplyBtn, row, e);
          },
          true
        );
      }
    });
  }

  function init() {
    if (!hasRuntimeMessaging()) {
      recoverRuntime("Extension runtime unavailable during init");
      return;
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "leadUpdated") {
        updateRowFromLead(message.lead);
      }
    });

    if (!delegatedCheckReplyBound) {
      delegatedCheckReplyBound = true;
      document.addEventListener(
        "click",
        async (e) => {
          const target = e.target;
          if (!target || typeof target.closest !== "function") {
            return;
          }
          const btn = target.closest('button[data-action="check-reply"]');
          if (!btn || btn.disabled) {
            return;
          }
          const row = btn.closest("tr");
          await handleCheckReplyClick(btn, row, e);
        },
        true
      );
    }

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

