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

  if (workbook.SheetNames.length === 0) {
    return { success: false, error: "No sheets found in file." };
  }

  let rows: Record<string, unknown>[] = [];
  let totalSheetRows = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    totalSheetRows += sheetRows.length;

    const startIndex = startRow - 2;
    const endIndex = endRow === Infinity ? undefined : endRow - 1;

    rows = rows.concat(sheetRows.slice(startIndex, endIndex));
  }

  const toInsert: Array<{
    campaignId: string;
    recipientName: string;
    recipientEmail: string;
    websiteUrl?: string | null;
    niche?: string | null;
  }> = [];

  const existingLeads = await prisma.lead.findMany({
    where: { campaignId: campaignId.trim() },
    select: { recipientEmail: true },
  });

  const existingEmails = new Set(
    existingLeads.map(l => l.recipientEmail.split(',')[0].trim().toLowerCase())
  );
  const existingDomains = new Set(
    existingLeads
      .map(l => l.recipientEmail.split(',')[0].trim().toLowerCase().split('@')[1]?.trim())
      .filter(Boolean)
  );

  const seenEmailsInSheet = new Set<string>();
  const seenDomainsInSheet = new Set<string>();
  const PUBLIC_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'aol.com', 'ymail.com', 'live.com', 'msn.com'
  ]);

  let skippedCount = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const lead = rowToLead(row, campaignId.trim());
    if (lead) {
      const primaryEmailLower = lead.recipientEmail.split(',')[0].trim().toLowerCase();
      const domainLower = primaryEmailLower.split('@')[1]?.trim() || '';
      const isPublic = PUBLIC_DOMAINS.has(domainLower);

      const isDuplicateEmail = existingEmails.has(primaryEmailLower) || seenEmailsInSheet.has(primaryEmailLower);
      const isDuplicateDomain = !isPublic && domainLower ? (existingDomains.has(domainLower) || seenDomainsInSheet.has(domainLower)) : false;

      if (!isDuplicateEmail && !isDuplicateDomain) {
        toInsert.push(lead);
        seenEmailsInSheet.add(primaryEmailLower);
        if (domainLower && !isPublic) {
          seenDomainsInSheet.add(domainLower);
        }
      } else {
        skippedCount++;
      }
    }
  }

  const actualEndRow = startRow - 1 + rows.length;
  const nextStartRow = actualEndRow + 1;

  if (toInsert.length === 0) {
    await prisma.importLog.create({
      data: {
        campaignId: campaignId.trim(),
        fileName: file.name,
        startRow,
        endRow: actualEndRow,
        importedCount: 0,
        skippedCount,
      },
    });
    revalidatePath("/dashboard");
    return { success: true, count: 0, skipped: skippedCount, nextStartRow };
  }

  try {
    const result = await prisma.lead.createMany({
      data: toInsert,
    });

    await prisma.importLog.create({
      data: {
        campaignId: campaignId.trim(),
        fileName: file.name,
        startRow,
        endRow: actualEndRow,
        importedCount: result.count,
        skippedCount,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, count: result.count, skipped: skippedCount, nextStartRow };
  } catch (err) {
    console.error("Import error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to import leads.",
    };
  }
}
