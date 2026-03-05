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

  if (!campaignId || !recipientName || !recipientEmail) {
    throw new Error("Campaign, recipient name, and recipient email are required.");
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

  revalidatePath("/dashboard");
}

export async function updateLead(leadId: string, formData: FormData) {
  const campaignId = trim(formData.get("campaignId") as string | null);
  const recipientName = trim(formData.get("recipientName") as string | null);
  const recipientEmail = trim(formData.get("recipientEmail") as string | null);
  const websiteUrl = trim(formData.get("websiteUrl") as string | null) || null;
  const niche = trim(formData.get("niche") as string | null) || null;

  if (!leadId) throw new Error("Lead ID is required.");
  if (!campaignId || !recipientName || !recipientEmail) {
    throw new Error("Campaign, recipient name, and recipient email are required.");
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");

  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error("Lead not found.");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      campaignId,
      recipientName,
      recipientEmail,
      websiteUrl: websiteUrl || undefined,
      niche: niche || undefined,
    },
  });

  revalidatePath("/dashboard");
}

export async function deleteLead(leadId: string) {
  if (!leadId) throw new Error("Lead ID is required.");

  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error("Lead not found.");

  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/dashboard");
}

export async function deletePendingLeads(campaignId?: string | null) {
  const where: any = { status: "pending" };
  if (campaignId) {
    where.campaignId = campaignId;
  }

  await prisma.lead.deleteMany({
    where
  });

  revalidatePath("/dashboard");
}
