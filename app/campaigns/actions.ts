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
  const delay1Days = parseInt(String(formData.get("delay1Days") ?? "3"), 10) || 3;
  const delay2Days = parseInt(String(formData.get("delay2Days") ?? "3"), 10) || 3;
  const rawProvider = formData.get("provider");
  const provider = typeof rawProvider === "string" && rawProvider === "smtp" ? "smtp" : "gmail_manual";

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
      provider,
    },
  });

  revalidatePath("/campaigns");
  redirect("/campaigns");
}
