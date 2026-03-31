"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function trim(s: string | null | undefined): string {
  return s?.trim() ?? "";
}

export async function createLead(formData: FormData) {
  const campaignId = trim(formData.get("campaignId") as string | null);
  const recipientName = trim(formData.get("recipientName") as string | null);
  const recipientEmail = trim(formData.get("recipientEmail") as string | null);
  const websiteUrl = trim(formData.get("websiteUrl") as string | null) || null;
  const niche = trim(formData.get("niche") as string | null) || null;

  if (!campaignId || !recipientEmail) {
    throw new Error("Campaign and recipient email are required.");
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  await prisma.lead.create({
    data: {
      campaignId,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl || undefined,
      niche: niche || undefined,
    },
  });

  revalidatePath("/dashboard", "layout");
}

export async function updateLead(leadId: string, formData: FormData) {
  const campaignId = trim(formData.get("campaignId") as string | null);
  const recipientName = trim(formData.get("recipientName") as string | null);
  const recipientEmail = trim(formData.get("recipientEmail") as string | null);
  const websiteUrl = trim(formData.get("websiteUrl") as string | null) || null;
  const niche = trim(formData.get("niche") as string | null) || null;

  if (!leadId) throw new Error("Lead ID is required.");
  if (!campaignId || !recipientEmail) {
    throw new Error("Campaign and recipient email are required.");
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");

  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error("Lead not found.");

  const status = trim(formData.get("status") as string | null) || existing.status;
  const step = Number.parseInt(formData.get("step") as string || String(existing.step), 10);
  const replied = formData.get("replied") === "true";
  const unsubscribed = formData.get("unsubscribed") === "true";

  const sentGmailAuthUser = trim(formData.get("sentGmailAuthUser") as string | null) || null;
  const gmailThreadId = trim(formData.get("gmailThreadId") as string | null) || null;
  const replyCategory = trim(formData.get("replyCategory") as string | null) || null;

  // Parse optional datetime fields — empty string means clear the value.
  function parseDateTime(raw: FormDataEntryValue | null): Date | null | undefined {
    const s = trim(raw as string | null);
    if (!s) return null; // explicit clear
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d; // undefined = don't touch
  }

  const sentAt = parseDateTime(formData.get("sentAt"));
  const nextFollowupRaw = parseDateTime(formData.get("nextFollowup"));

  // If status/replied forces clearing the followup, honour that.
  const clearFollowup = status === "replied" || status === "bounced" || replied;
  const nextFollowup = clearFollowup ? null : nextFollowupRaw;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      campaignId,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl || undefined,
      niche: niche || undefined,
      status,
      step: isNaN(step) ? existing.step : step,
      replied,
      unsubscribed,
      replyCategory,
      sentGmailAuthUser,
      gmailThreadId,
      ...(sentAt !== undefined ? { sentAt } : {}),
      ...(nextFollowup !== undefined ? { nextFollowup } : {}),
    },
  });

  revalidatePath("/dashboard", "layout");
}

export async function deleteLead(leadId: string) {
  if (!leadId) throw new Error("Lead ID is required.");

  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error("Lead not found.");

  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/dashboard", "layout");
}

export async function deletePendingLeads(campaignId?: string | null) {
  const where: any = { status: "pending" };
  if (campaignId) {
    where.campaignId = campaignId;
  }

  await prisma.lead.deleteMany({
    where
  });

  revalidatePath("/dashboard", "layout");
}

export async function bulkTriggerFollowup(leadIds: string[]) {
  if (!leadIds || leadIds.length === 0) return;

  const now = new Date();
  // We only want to trigger follow-up for leads that are in a state where follow-up makes sense.
  // Actually, LeadFollowupButton checks if step < 3 and status != 'replied'.

  await prisma.lead.updateMany({
    where: {
      id: { in: leadIds },
      status: { not: "replied" },
      replied: false,
      step: { lt: 3 }
    },
    data: {
      nextFollowup: now
    }
  });

  revalidatePath("/dashboard", "layout");
}

export async function bulkDeleteLeads(leadIds: string[]) {
  if (!leadIds || leadIds.length === 0) return;

  await prisma.lead.deleteMany({
    where: { id: { in: leadIds } },
  });

  revalidatePath("/dashboard", "layout");
}
