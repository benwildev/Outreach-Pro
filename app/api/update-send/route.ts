import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, email, subject, body: emailBody, threadId, recipientEmail, sentGmailAuthUser, status, scheduledSendAt } = body;

    let targetLeadId = leadId;
    if (!targetLeadId && email) {
      const foundLead = await prisma.lead.findFirst({
        where: { recipientEmail: email },
        orderBy: { createdAt: "desc" }
      });
      if (foundLead) {
        targetLeadId = foundLead.id;
      }
    }

    if (!targetLeadId) {
      return NextResponse.json(
        { error: "leadId or email is required" },
        { status: 400 }
      );
    }

    // Log the email details for debugging
    console.log(
      `[Email Sent] Lead: ${leadId} | Recipient: ${recipientEmail} | ThreadId: ${threadId} | AuthUser: ${sentGmailAuthUser ?? ""}`
    );
    if (subject) console.log(`[Email Subject] ${subject}`);
    if (emailBody) console.log(`[Email Body Preview] ${emailBody.substring(0, 100)}...`);

    // Get the lead to find the campaign for delay calculation
    const lead = await prisma.lead.findUnique({
      where: { id: targetLeadId },
      include: { campaign: true },
    });

    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Determine the effective send time.
    // For scheduled emails the extension passes scheduledSendAt (the actual Gmail
    // delivery time, e.g. "2026-03-25T11:05"). For immediate sends it is absent.
    // sentAt should reflect when the email is delivered, not when we clicked Schedule.
    const now = new Date();
    let effectiveSentAt = now;
    if (scheduledSendAt && typeof scheduledSendAt === "string" && scheduledSendAt.trim()) {
      const parsed = new Date(scheduledSendAt.trim());
      if (!isNaN(parsed.getTime())) {
        effectiveSentAt = parsed;
        console.log(`[Email Sent] Using scheduled delivery time for sentAt: ${effectiveSentAt.toISOString()}`);
      }
    }

    // Calculate next followup delay (using calendar days at midnight from effective send time)
    const delay1Days = lead.campaign?.delay1Days ?? 3;
    const nextFollowupDate = new Date(effectiveSentAt);
    nextFollowupDate.setDate(nextFollowupDate.getDate() + delay1Days);
    nextFollowupDate.setHours(0, 0, 0, 0);

    const targetStatus = status || "sent";
    const isDelivered = targetStatus === "sent" || targetStatus === "scheduled";

    // Update the lead with thread ID, subject, body, AND mark as sent/scheduled/failed
    const updatedLead = await prisma.lead.update({
      where: { id: targetLeadId },
      data: {
        status: targetStatus,
        step: isDelivered ? 1 : lead.step,
        ...(isDelivered ? {
          sentAt: effectiveSentAt,
          nextFollowup: nextFollowupDate
        } : {}),
        ...(threadId ? { gmailThreadId: threadId } : {}),
        ...(sentGmailAuthUser !== undefined && sentGmailAuthUser !== null ? { sentGmailAuthUser: String(sentGmailAuthUser).trim() } : {}),
        ...(subject ? { sentSubject: subject } : {}),
        ...(emailBody ? { sentBody: emailBody } : {}),
      },
    });

    // Trigger webhook if present and email was actually sent
    if (targetStatus === "sent" && lead.campaign?.webhookUrl) {
      try {
        await fetch(lead.campaign.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: lead.recipientEmail,
            account: (sentGmailAuthUser !== undefined && sentGmailAuthUser !== null) ? String(sentGmailAuthUser) : "SMTP",
            date: now.toISOString(),
            status: targetStatus,
            isFollowup: false,
          }),
        });
        console.log(`[Webhook] Successfully triggered webhook for ${lead.recipientEmail}`);
      } catch (webhookError) {
        console.error(`[Webhook] Failed to trigger webhook for ${lead.recipientEmail}:`, webhookError);
        // Continue even if webhook fails (we still successfully updated our DB)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Lead marked as sent with email details",
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}
