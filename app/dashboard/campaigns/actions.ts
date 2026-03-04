"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function trim(s: string | null | undefined): string {
  return s?.trim() ?? "";
}

export async function createCampaign(formData: FormData) {
  const name = trim(formData.get("name") as string | null);
  const subject = trim(formData.get("subject") as string | null);
  const body = trim(formData.get("body") as string | null);
  const followup1 = trim(formData.get("followup1") as string | null) || null;
  const followup2 = trim(formData.get("followup2") as string | null) || null;
  const delay1Days = (() => { const d = parseInt(String(formData.get("delay1Days") ?? "3"), 10); return Number.isNaN(d) || d < 0 ? 3 : d; })();
  const delay2Days = (() => { const d = parseInt(String(formData.get("delay2Days") ?? "5"), 10); return Number.isNaN(d) || d < 0 ? 5 : d; })();

  if (!name || !subject || !body) {
    throw new Error("Name, subject, and body are required.");
  }

  await prisma.campaign.create({
    data: {
      name,
      subject,
      body,
      followup1: followup1 || undefined,
      followup2: followup2 || undefined,
      delay1Days,
      delay2Days,
    },
  });

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function updateCampaign(id: string, formData: FormData) {
  const name = trim(formData.get("name") as string | null);
  const subject = trim(formData.get("subject") as string | null);
  const body = trim(formData.get("body") as string | null);
  const followup1 = trim(formData.get("followup1") as string | null) || null;
  const followup2 = trim(formData.get("followup2") as string | null) || null;
  const delay1Days = (() => { const d = parseInt(String(formData.get("delay1Days") ?? "3"), 10); return Number.isNaN(d) || d < 0 ? 3 : d; })();
  const delay2Days = (() => { const d = parseInt(String(formData.get("delay2Days") ?? "5"), 10); return Number.isNaN(d) || d < 0 ? 5 : d; })();

  if (!name || !subject || !body) {
    throw new Error("Name, subject, and body are required.");
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      name,
      subject,
      body,
      followup1: followup1 || undefined,
      followup2: followup2 || undefined,
      delay1Days,
      delay2Days,
    },
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  redirect("/dashboard/campaigns");
}

export async function deleteCampaign(id: string) {
  const count = await prisma.lead.count({ where: { campaignId: id } });
  if (count > 0) {
    throw new Error("Cannot delete campaign with leads. Remove or reassign leads first.");
  }
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}
