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
  const recipientName = getCell(row, "Recipient Name", "recipientName");
  const recipientEmail = getCell(row, "Recipient Email", "recipientEmail");
  const websiteUrl = getCell(row, "Website URL", "websiteUrl", "Website") || null;
  const niche = getCell(row, "Niche", "niche") || null;

  if (!recipientEmail) return null;

  return {
    campaignId,
    recipientName: recipientName || "", // Don't fallback to email
    recipientEmail,
    websiteUrl: websiteUrl || undefined,
    niche: niche || undefined,
  };
}

export type ImportResult =
  | { success: true; count: number }
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

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { success: false, error: "No sheets found in file." };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const toInsert: Array<{
    campaignId: string;
    recipientName: string;
    recipientEmail: string;
    websiteUrl?: string | null;
    niche?: string | null;
  }> = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const lead = rowToLead(row, campaignId.trim());
    if (lead) toInsert.push(lead);
  }

  if (toInsert.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    const result = await prisma.lead.createMany({
      data: toInsert,
    });
    revalidatePath("/dashboard");
    return { success: true, count: result.count };
  } catch (err) {
    console.error("Import error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to import leads.",
    };
  }
}
