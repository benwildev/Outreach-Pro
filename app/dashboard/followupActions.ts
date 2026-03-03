"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildTrackedBody } from "@/lib/tracking";

export type SendFollowupResult =
  | { success: true; type: "redirect"; url: string }
  | { success: true; type: "success" }
  | { success: false; error: string };

export async function sendFollowup(leadId: string): Promise<SendFollowupResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { campaign: true },
  });
  if (!lead) {
    return { success: false, error: "Lead not found." };
  }
  if (lead.status === "replied" || lead.replied) {
    return { success: false, error: "Lead already replied." };
  }
  if (lead.status !== "sent") {
    return { success: false, error: "Lead must be sent first." };
  }
  if (lead.step >= 3) {
    return { success: false, error: "No more follow-ups." };
  }
  const now = new Date();
  if (!lead.nextFollowup || lead.nextFollowup > now) {
    return { success: false, error: "Follow-up not due yet." };
  }

  const { campaign } = lead;
  let body: string;
  let stepUpdate: number;
  let nextFollowupUpdate: Date | null;

  if (lead.step === 1) {
    body = (campaign.followup1 ?? "").trim();
    if (!body) {
      return { success: false, error: "Follow-up 1 content is empty." };
    }
    stepUpdate = 2;
    const delay2Ms = (campaign.delay2Days ?? 3) * 24 * 60 * 60 * 1000;
    nextFollowupUpdate = new Date(Date.now() + delay2Ms);
  } else if (lead.step === 2) {
    body = (campaign.followup2 ?? "").trim();
    if (!body) {
      return { success: false, error: "Follow-up 2 content is empty." };
    }
    stepUpdate = 3;
    nextFollowupUpdate = null;
  } else {
    return { success: false, error: "No more follow-ups." };
  }

  const hasGmailApi =
    !!(
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET
    );
  const useGmailApi =
    campaign.provider !== "smtp" && hasGmailApi && !!lead.gmailThreadId;
  const provider = campaign.provider === "smtp"
    ? "smtp"
    : useGmailApi
      ? "gmail_api"
      : "gmail_manual";
  const followUpSubject = "Re: " + campaign.subject;
  const trackedBody = buildTrackedBody(body, lead.id);
  let sendResult: Awaited<ReturnType<typeof sendEmail>>;
  try {
    sendResult = await sendEmail({
      provider,
      to: lead.recipientEmail,
      subject: followUpSubject,
      body,
      html: trackedBody,
      ...(useGmailApi && lead.gmailThreadId
        ? { threadId: lead.gmailThreadId }
        : {}),
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send follow-up.",
    };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      step: stepUpdate,
      nextFollowup: nextFollowupUpdate,
    },
  });

  revalidatePath("/dashboard");

  if (sendResult.type === "redirect") {
    return { success: true, type: "redirect", url: sendResult.url };
  }
  return { success: true, type: "success" };
}
