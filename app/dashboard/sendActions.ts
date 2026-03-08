"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildTrackedBody } from "@/lib/tracking";

export type SendLeadResult =
  | { success: true; type: "redirect"; url: string }
  | { success: true; type: "extension_workflow"; data: any }
  | { success: true; type: "success" }
  | { success: false; error: string };

export async function sendLead(leadId: string, scheduleTime?: string): Promise<SendLeadResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { campaign: true },
  });
  if (!lead) {
    return { success: false, error: "Lead not found." };
  }
  if (lead.status === "sent") {
    return { success: false, error: "Already sent." };
  }

  const { campaign } = lead;
  const hasGmailApi =
    !!(
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET
    );
  const provider =
    campaign.provider === "smtp"
      ? "smtp"
      : hasGmailApi
        ? "gmail_api"
        : "gmail_manual";
  const delay1Ms = (campaign.delay1Days ?? 3) * 86400000;

  // For gmail_manual, we want the extension to handle the ChatGPT -> Gmail flow
  if (provider === "gmail_manual") {
    return {
      success: true,
      type: "extension_workflow",
      data: {
        leadId: lead.id,
        recipientName: lead.recipientName,
        recipientEmail: lead.recipientEmail,
        websiteUrl: lead.websiteUrl || "",
        niche: lead.niche || "",
        campaignId: campaign.id,
        campaignChatId: campaign.chatGptChatId || "",
        campaignGmailAuthUser: campaign.gmailAuthUser || "",
        campaignBody: campaign.body || "",
        campaignSubject: campaign.subject || "",
        campaignSignature: campaign.signature || "",
        scheduleSendTime: scheduleTime || "",
      }
    };
  }

  const trackedBody = buildTrackedBody(campaign.body, lead.id);
  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail({
      provider,
      to: lead.recipientEmail,
      subject: campaign.subject,
      body: campaign.body,
      html: trackedBody,
      scheduleTime,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send.",
    };
  }

  // Only update status to "sent" if using SMTP or Gmail API (auto-send)
  // For manual Gmail (extension), the status will be updated when /api/update-send is called
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "sent",
      step: 1,
      sentAt: new Date(),
      nextFollowup: new Date(Date.now() + delay1Ms),
      ...(result.type === "success" && result.threadId
        ? { gmailThreadId: result.threadId }
        : {}),
    },
  });

  revalidatePath("/dashboard");

  if (result.type === "redirect") {
    return { success: true, type: "redirect", url: result.url };
  }
  return { success: true, type: "success" };
}
