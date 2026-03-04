/**
 * Shared utilities for the Leads Dashboard AI Outreach extension
 * Primary prompt source: campaign body from database (via data-campaign-body on each row).
 * Fallbacks below run only when the campaign has no body saved.
 */

var HUMAN_TONE_INSTRUCTION =
  "\n\nStyle: Write like a real person, not AI. Use short, clear sentences. Do not use em-dashes (—); use commas or full stops instead. Keep the tone conversational and natural. Avoid stiff or overly formal phrasing. Avoid generic flattery, avoid sounding salesy, and avoid lines that feel copied from a template.";

var EMAIL_STRUCTURE_INSTRUCTION =
  "\n\nStructure the email exactly like a human would:\n" +
  "- Start with a short greeting using the recipient's real first name.\n" +
  "- Skip filler like \"I hope you are doing well\" unless there is a specific reason.\n" +
  "- One or two short intro paragraphs: who you are and the concrete reason you're reaching out.\n" +
  "- Mention one specific fit point tied to the recipient's site, niche, or audience. If you do not know one, keep it neutral instead of inventing details.\n" +
  "- A clear transition line before the list, e.g. \"A few angles that may fit your audience:\".\n" +
  "- A bullet list (3 items), each one line and specific. Use a single dash or bullet character (- or •) at the start of each list item.\n" +
  "- A short closing line offering next steps, e.g. \"If any of these are a fit, I can send over an outline.\"\n" +
  "- Then a simple thank-you line.\n" +
  "- End with \"Best regards,\" only.\n" +
  "- Do not add any sender name or signature line unless that exact line already exists in the campaign template.\n" +
  "- Do not use placeholders such as [Your Name], {{topic}}, [Company Name], or bracketed template text anywhere in the final email.";

var ANTI_AI_PHRASES_INSTRUCTION =
  "\n\nAvoid these phrases unless the user explicitly wrote them in the campaign template:\n" +
  "- I hope you are doing well\n" +
  "- I have been reading through your site\n" +
  "- It is clear you focus on real value\n" +
  "- I would love to collaborate\n" +
  "- genuinely helps your audience\n" +
  "- well researched guest article";

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
  prompt += ANTI_AI_PHRASES_INSTRUCTION;
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
    ANTI_AI_PHRASES_INSTRUCTION +
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
    "Suggest one subject line and 3 content topics; include them in the email. Use bullet points for the topics.\n" +
    HUMAN_TONE_INSTRUCTION +
    EMAIL_STRUCTURE_INSTRUCTION +
    ANTI_AI_PHRASES_INSTRUCTION +
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

function cleanEmailBody(text, data) {
  if (!text || typeof text !== "string") {
    return "";
  }

  const recipientName = (data && data.recipientName ? String(data.recipientName) : "").trim();
  const firstName = recipientName.split(/\s+/)[0] || "there";

  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = stripExtensionNoise(cleaned);

  cleaned = cleaned.replace(/\[Your Name\]|\[YourCompany\]|\[Company Name\]/gi, "");
  cleaned = cleaned.replace(/\{\{[^}]+\}\}/g, "");
  cleaned = cleaned.replace(/\[[^[\]]+\]/g, function(match) {
    if (/^\[(?:your name|yourcompany|company name)\]$/i.test(match)) {
      return "";
    }
    return match;
  });

  cleaned = cleaned.replace(/^Hi\s+[^,\n]+,/im, "Hi " + firstName + ",");
  cleaned = cleaned.replace(/^Hello\s+[^,\n]+,/im, "Hi " + firstName + ",");

  cleaned = cleaned.replace(/\bI hope you are doing well\.?\s*/i, "");
  cleaned = cleaned.replace(/\bI have been reading through your site and really enjoyed the way you break down complex topics into practical advice\.?\s*/i, "");
  cleaned = cleaned.replace(/\bIt is clear you focus on real value for your readers\.?\s*/i, "");
  cleaned = cleaned.replace(/\bI'd love to collaborate!?\s*/i, "Thanks for your time.\n");

  cleaned = cleaned
    .split("\n")
    .map(function(line) {
      return line.replace(/[ \t]+$/g, "");
    })
    .join("\n");

  const preserveTemplateSignature = !!(data && data.templateHasSignature);
  if (!preserveTemplateSignature) {
    cleaned = stripGeneratedNameAfterSignoff(cleaned);
  }

  const signatureBlock =
    data && typeof data.signatureBlock === "string" ? data.signatureBlock.trim() : "";
  if (signatureBlock) {
    cleaned = enforceTemplateSignatureBlock(cleaned, signatureBlock);
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

function extractTemplateSignatureBlock(templateText) {
  const raw = String(templateText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  let signoffIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = String(lines[i] || "").trim();
    if (/^(best|best regards|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/i.test(line)) {
      signoffIndex = i;
      break;
    }
  }
  if (signoffIndex === -1) return "";

  const tail = lines.slice(signoffIndex).map(function(line) {
    return String(line || "").replace(/[ \t]+$/g, "");
  });
  const hasNameLikeLine = tail.slice(1).some(function(line) {
    return !!String(line || "").trim();
  });
  if (!hasNameLikeLine) return "";

  return tail.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function enforceTemplateSignatureBlock(bodyText, signatureBlock) {
  const body = String(bodyText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const signature = String(signatureBlock || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!body || !signature) return body;

  const lines = body.split("\n");
  let signoffIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = String(lines[i] || "").trim();
    if (/^(best|best regards|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/i.test(line)) {
      signoffIndex = i;
      break;
    }
  }

  const prefix = signoffIndex === -1
    ? body
    : lines.slice(0, signoffIndex).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!prefix) return signature;
  return (prefix + "\n\n" + signature).replace(/\n{3,}/g, "\n\n").trim();
}

function stripExtensionNoise(text) {
  const lines = String(text || "").split("\n");
  const filtered = lines.filter(function(line) {
    const value = String(line || "").trim();
    if (!value) return true;
    if (/window\.__oai_/i.test(value)) return false;
    if (/__oai_(?:logHTML|SSR_HTML|logTTI|SSR_TTI)/i.test(value)) return false;
    if (/requestAnimationFrame\s*\(/i.test(value)) return false;
    if (/Date\.now\(\)/i.test(value) && /__oai_/i.test(value)) return false;
    return true;
  });
  return filtered.join("\n");
}

function stripGeneratedNameAfterSignoff(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n");
  let end = lines.length - 1;
  while (end >= 0 && !String(lines[end] || "").trim()) end -= 1;
  if (end < 0) return raw;

  const isSignoff = function(line) {
    return /^(best|best regards|kind regards|warm regards|regards|thanks|thank you|sincerely)[,!]?$/i.test(String(line || "").trim());
  };

  const looksLikeName = function(line) {
    const value = String(line || "").trim();
    if (!value || value.length > 48) return false;
    if (/[.!?:]/.test(value) || /@|https?:\/\//i.test(value)) return false;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) return false;
    return /^[A-Za-z][A-Za-z0-9 .'-]*$/.test(value);
  };

  let signoffIndex = -1;
  for (let i = end; i >= 0; i--) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (isSignoff(line)) {
      signoffIndex = i;
      break;
    }
    if (end - i > 6) break;
  }
  if (signoffIndex === -1) return raw;

  let hasNameLine = false;
  for (let i = signoffIndex + 1; i <= end; i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (!looksLikeName(line)) return raw;
    hasNameLine = true;
  }
  if (!hasNameLine) return raw;

  return lines.slice(0, signoffIndex + 1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
