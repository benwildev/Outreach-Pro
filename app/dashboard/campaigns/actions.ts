"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function trim(s: string | null | undefined): string {
  return s?.trim() ?? "";
}

function normalizeChatGptChatId(value: string): string {
  const raw = trim(value);
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (host !== "chatgpt.com" && host !== "chat.openai.com") {
        return "";
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0]?.toLowerCase() === "c" && segments[1]) {
        return trim(segments[1]);
      }
      if (segments[0]?.toLowerCase() === "g" && segments[1]) {
        return url.toString();
      }
      if (segments[0]?.toLowerCase() === "projects" || segments[0]?.toLowerCase() === "project") {
        return url.toString();
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  const prefixed = raw.match(/^c\/(.+)$/i);
  if (prefixed?.[1]) {
    return trim(prefixed[1]);
  }

  return raw;
}

function normalizeGmailAuthUser(value: string): string {
  const raw = trim(value);
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);
      const mailIdx = parts.findIndex((p) => p.toLowerCase() === "mail");
      if (mailIdx !== -1 && parts[mailIdx + 1]?.toLowerCase() === "u" && parts[mailIdx + 2]) {
        return trim(parts[mailIdx + 2]);
      }
    } catch {
      return "";
    }
  }

  return raw;
}

export async function createCampaign(formData: FormData) {
  const name = trim(formData.get("name") as string | null);
  const subject = trim(formData.get("subject") as string | null);
  const body = trim(formData.get("body") as string | null);
  const chatGptChatId = normalizeChatGptChatId(String(formData.get("chatGptChatId") ?? ""));
  const gmailAuthUser = normalizeGmailAuthUser(String(formData.get("gmailAuthUser") ?? ""));
  const followup1 = trim(formData.get("followup1") as string | null) || null;
  const followup2 = trim(formData.get("followup2") as string | null) || null;
  const signature = trim(formData.get("signature") as string | null) || null;
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
      chatGptChatId: chatGptChatId || undefined,
      gmailAuthUser: gmailAuthUser || undefined,
      followup1: followup1 || undefined,
      followup2: followup2 || undefined,
      signature: signature || undefined,
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
  const chatGptChatId = normalizeChatGptChatId(String(formData.get("chatGptChatId") ?? ""));
  const gmailAuthUser = normalizeGmailAuthUser(String(formData.get("gmailAuthUser") ?? ""));
  const followup1 = trim(formData.get("followup1") as string | null) || null;
  const followup2 = trim(formData.get("followup2") as string | null) || null;
  const signature = trim(formData.get("signature") as string | null) || null;
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
      chatGptChatId: chatGptChatId || null,
      gmailAuthUser: gmailAuthUser || null,
      followup1: followup1 || undefined,
      followup2: followup2 || undefined,
      signature: signature || null,
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
