"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

function getCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function rowToLead(
  row: Record<string, unknown>,
  campaignId: string
): {
  campaignId: string;
  recipientName: string;
  recipientEmail: string;
  websiteUrl?: string | null;
  niche?: string | null;
} | null {
  const recipientName = getCell(row, "Recipient Name", "recipientName", "Name", "Name ");
  const email1 = getCell(row, "Recipient Email", "recipientEmail", "Email");
  const email2 = getCell(row, "Contact us", "Secondary Email") || null;
  const websiteUrl = getCell(row, "Website URL", "websiteUrl", "Website", "Root Domain", "Target Sites", "Extracted Websites from Competitors \nListed on A Column") || null;
  const niche = getCell(row, "Niche", "niche") || null;

  if (!email1 && !email2) return null;

  const primaryEmail = email1 || email2;
  const secondaryEmail = (email1 && email2 && email1 !== email2) ? email2 : null;
  const recipientEmail = secondaryEmail ? `${primaryEmail},${secondaryEmail}` : primaryEmail;

  return {
    campaignId,
    recipientName: recipientName || "",
    recipientEmail: recipientEmail as string,
    websiteUrl: websiteUrl || undefined,
    niche: niche || undefined,
  };
}

export type ImportResult =
  | { success: true; count: number; skipped: number; nextStartRow: number }
  | { success: false; error: string };

type LeadRow = {
  campaignId: string;
  recipientName: string;
  recipientEmail: string;
  websiteUrl?: string | null;
  niche?: string | null;
};

async function processRows(
  allSheetRows: Record<string, unknown>[],
  campaignId: string,
  startRow: number,
  endRow: number
): Promise<{ toInsert: LeadRow[]; skippedCount: number; actualEndRow: number; nextStartRow: number }> {
  const startIndex = startRow - 2;
  const endIndex = endRow === Infinity ? undefined : endRow - 1;
  const rows = allSheetRows.slice(startIndex, endIndex);

  // Check duplicates across ALL campaigns (entire dashboard), not just current campaign
  const existingLeads = await prisma.lead.findMany({
    select: { recipientEmail: true, websiteUrl: true },
  });

  const PUBLIC_DOMAINS = new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "aol.com", "ymail.com", "live.com", "msn.com",
  ]);

  const existingEmails = new Set(
    existingLeads.map(l => l.recipientEmail.split(",")[0].trim().toLowerCase())
  );
  const existingDomains = new Set(
    existingLeads
      .map(l => l.recipientEmail.split(",")[0].trim().toLowerCase().split("@")[1]?.trim())
      .filter(Boolean)
  );
  const existingWebsites = new Set(
    existingLeads
      .map(l => l.websiteUrl?.trim().toLowerCase().replace(/\/+$/, ""))
      .filter(Boolean) as string[]
  );

  const seenEmailsInSheet = new Set<string>();
  const seenDomainsInSheet = new Set<string>();
  const seenWebsitesInSheet = new Set<string>();
  const toInsert: LeadRow[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const lead = rowToLead(row, campaignId);
    if (lead) {
      const primaryEmailLower = lead.recipientEmail.split(",")[0].trim().toLowerCase();
      const domainLower = primaryEmailLower.split("@")[1]?.trim() || "";
      const isPublic = PUBLIC_DOMAINS.has(domainLower);
      const websiteNorm = lead.websiteUrl?.trim().toLowerCase().replace(/\/+$/, "") || "";

      const isDuplicateEmail = existingEmails.has(primaryEmailLower) || seenEmailsInSheet.has(primaryEmailLower);
      const isDuplicateDomain = !isPublic && domainLower ? (existingDomains.has(domainLower) || seenDomainsInSheet.has(domainLower)) : false;
      const isDuplicateWebsite = websiteNorm ? (existingWebsites.has(websiteNorm) || seenWebsitesInSheet.has(websiteNorm)) : false;

      if (!isDuplicateEmail && !isDuplicateDomain && !isDuplicateWebsite) {
        toInsert.push(lead);
        seenEmailsInSheet.add(primaryEmailLower);
        if (domainLower && !isPublic) seenDomainsInSheet.add(domainLower);
        if (websiteNorm) seenWebsitesInSheet.add(websiteNorm);
      } else {
        skippedCount++;
      }
    }
  }

  const actualEndRow = startRow - 1 + rows.length;
  const nextStartRow = actualEndRow + 1;
  return { toInsert, skippedCount, actualEndRow, nextStartRow };
}

async function saveAndReturn(
  toInsert: LeadRow[],
  skippedCount: number,
  campaignId: string,
  fileName: string,
  startRow: number,
  actualEndRow: number,
  nextStartRow: number
): Promise<ImportResult> {
  if (toInsert.length === 0) {
    await prisma.importLog.create({
      data: { campaignId, fileName, startRow, endRow: actualEndRow, importedCount: 0, skippedCount },
    });
    revalidatePath("/dashboard");
    return { success: true, count: 0, skipped: skippedCount, nextStartRow };
  }

  try {
    const result = await prisma.lead.createMany({ data: toInsert });
    await prisma.importLog.create({
      data: { campaignId, fileName, startRow, endRow: actualEndRow, importedCount: result.count, skippedCount },
    });
    revalidatePath("/dashboard");
    return { success: true, count: result.count, skipped: skippedCount, nextStartRow };
  } catch (err) {
    console.error("Import error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to import leads." };
  }
}

function parseRowRange(formData: FormData): { startRow: number; endRow: number } {
  const startRowStr = formData.get("startRow");
  const endRowStr = formData.get("endRow");

  let startRow = 2;
  if (startRowStr && typeof startRowStr === "string" && startRowStr.trim()) {
    const parsed = parseInt(startRowStr.trim(), 10);
    if (!isNaN(parsed) && parsed >= 2) startRow = parsed;
  }

  let endRow = Infinity;
  if (endRowStr && typeof endRowStr === "string" && endRowStr.trim()) {
    const parsed = parseInt(endRowStr.trim(), 10);
    if (!isNaN(parsed) && parsed >= 2) endRow = parsed;
  }

  if (startRow > endRow) {
    const temp = startRow;
    startRow = endRow;
    endRow = temp;
  }
  return { startRow, endRow };
}

export async function importLeads(formData: FormData): Promise<ImportResult> {
  const campaignId = formData.get("campaignId");
  if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
    return { success: false, error: "Please select a campaign." };
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId.trim() } });
  if (!campaign) {
    return { success: false, error: "Campaign not found." };
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { success: false, error: "Please select a file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return { success: false, error: "File is empty." };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  } catch {
    return { success: false, error: "Invalid or unsupported file format." };
  }

  if (workbook.SheetNames.length === 0) {
    return { success: false, error: "No sheets found in file." };
  }

  const sheetNameParam = formData.get("sheetName");
  const resolvedSheetName =
    typeof sheetNameParam === "string" &&
    sheetNameParam.trim() &&
    workbook.SheetNames.includes(sheetNameParam.trim())
      ? sheetNameParam.trim()
      : workbook.SheetNames[0];

  const sheet = workbook.Sheets[resolvedSheetName];
  const allSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const { startRow, endRow } = parseRowRange(formData);
  const { toInsert, skippedCount, actualEndRow, nextStartRow } = await processRows(
    allSheetRows,
    campaignId.trim(),
    startRow,
    endRow
  );

  return saveAndReturn(toInsert, skippedCount, campaignId.trim(), file.name, startRow, actualEndRow, nextStartRow);
}

function parseGSheetsUrl(url: string): { spreadsheetId: string; gid: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "docs.google.com") return null;

    // Extract spreadsheet ID from path: /spreadsheets/d/{ID}/
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return null;
    const spreadsheetId = idMatch[1];

    // Extract GID from fragment (#gid=...) or query param (gid=...)
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    return { spreadsheetId, gid };
  } catch {
    return null;
  }
}

export async function importLeadsFromGSheets(formData: FormData): Promise<ImportResult> {
  const campaignId = formData.get("campaignId");
  if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
    return { success: false, error: "Please select a campaign." };
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId.trim() } });
  if (!campaign) {
    return { success: false, error: "Campaign not found." };
  }

  const sheetUrl = formData.get("sheetUrl");
  if (!sheetUrl || typeof sheetUrl !== "string" || !sheetUrl.trim()) {
    return { success: false, error: "Please paste a Google Sheets URL." };
  }

  const parsed = parseGSheetsUrl(sheetUrl.trim());
  if (!parsed) {
    return { success: false, error: "Invalid Google Sheets URL. Make sure it looks like: https://docs.google.com/spreadsheets/d/..." };
  }

  const { spreadsheetId, gid } = parsed;

  const fetchHeaders = {
    "User-Agent": "Mozilla/5.0 (compatible; outreach-bot/1.0)",
    "Accept": "text/csv,text/plain,*/*",
  };

  const urlsToTry = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pub?gid=${gid}&single=true&output=csv`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  ];

  let csvText: string = "";
  let lastError = "";
  for (const exportUrl of urlsToTry) {
    try {
      const res = await fetch(exportUrl, { redirect: "follow", headers: fetchHeaders });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        lastError = "received HTML instead of CSV";
        continue;
      }
      csvText = await res.text();
      if (csvText.trim()) break;
      lastError = "empty response";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!csvText.trim()) {
    return {
      success: false,
      error: `Could not fetch sheet (${lastError}). Make sure the sheet is shared as "Anyone with the link can view".`,
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(csvText, { type: "string", raw: true });
  } catch {
    return { success: false, error: "Failed to parse the sheet data." };
  }

  if (workbook.SheetNames.length === 0) {
    return { success: false, error: "No data found in sheet." };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const { startRow, endRow } = parseRowRange(formData);
  const { toInsert, skippedCount, actualEndRow, nextStartRow } = await processRows(
    allSheetRows,
    campaignId.trim(),
    startRow,
    endRow
  );

  return saveAndReturn(toInsert, skippedCount, campaignId.trim(), sheetUrl.trim(), startRow, actualEndRow, nextStartRow);
}
