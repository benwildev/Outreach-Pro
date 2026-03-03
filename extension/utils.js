/**
 * Shared utilities for the Leads Dashboard AI Outreach extension
 * Primary prompt source: campaign body from database (via data-campaign-body on each row).
 * Fallbacks below run only when the campaign has no body saved.
 */

var HUMAN_TONE_INSTRUCTION =
  "\n\nStyle: Write like a real person, not AI. Use short, clear sentences. Do not use em-dashes (—); use commas or full stops instead. Keep the tone conversational and natural. Avoid stiff or overly formal phrasing.";

var EMAIL_STRUCTURE_INSTRUCTION =
  "\n\nStructure the email exactly like a human would:\n" +
  "- Start with a short greeting (Hi [Name],).\n" +
  "- One or two short intro paragraphs: who you are and why you're reaching out, then why this platform is a good fit.\n" +
  "- A clear transition line before the list, e.g. \"Here are three topic ideas that...\" or \"Here are a few angles I can cover:\".\n" +
  "- A bullet list (3 items), each one line and specific. Use a single dash or bullet character (- or •) at the start of each list item.\n" +
  "- A short closing line offering next steps, e.g. \"If any of these sound like a good fit, I'd be happy to send over an outline.\"\n" +
  "- Then: \"Thank you for your time. I'd love to collaborate!\"\n" +
  "- Sign off with \"Best regards,\" followed by a name or signature line.";

function buildPrompt(data) {
  const campaignBody = (data.campaignBody || "").trim();
  if (campaignBody) {
    return buildPromptFromCampaignBody(data, campaignBody);
  }
  // Fallback only when campaign has no body in database (e.g. empty Email Body in Edit Campaign).
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
    "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>"
  );
}

/** Only used when campaign body from database is empty (fallback). */
function buildGuestPostPrompt(data) {
  const name = data.recipientName || "Recipient";
  const email = data.recipientEmail || "";
  const websiteUrl = (data.websiteUrl || data.website || "").trim() || "the given website";
  const niche = (data.niche || "").trim() || "their niche";

  return (
    "Deeply browse this website: " + websiteUrl + " and write a short and personalized guest post request focusing on " + niche + ".\n\n" +
    "Recipient Name: " + name + "\nRecipient Email: " + email + "\n\n" +
    "Suggest two subject lines and 3 content topics; include them in the email. Use bullet points for the topics.\n" +
    HUMAN_TONE_INSTRUCTION +
    EMAIL_STRUCTURE_INSTRUCTION +
    "\n\nReturn output EXACTLY in this format:\n\nSubject: <single line subject>\nBody:\n<email body only>"
  );
}

/**
 * Parse ChatGPT-style response into { subject, body }
 * Captures full body: everything after "Body:" to end of string.
 */
function parseEmailResponse(text) {
  if (!text || typeof text !== "string") {
    return { subject: "", body: "" };
  }
  const trimmed = text.trim();
  const subjectMatch = trimmed.match(/^Subject:\s*(.+?)(?=\n|$)/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : "";
  const bodyMatch = trimmed.match(/Body:\s*([\s\S]*)/im);
  const body = bodyMatch ? bodyMatch[1].trim() : "";
  return { subject, body };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(context, ...args) {
  console.log(`[Leads Extension ${context}]`, ...args);
}

function logError(context, err) {
  console.error(`[Leads Extension ${context}]`, err);
}
