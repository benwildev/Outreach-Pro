import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, email, subject, body: emailBody, threadId, recipientEmail, sentGmailAuthUser, status } = body;

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

    // Calculate next followup delay
    const delay1Ms = (lead.campaign?.delay1Days ?? 3) * 86400000;

    const targetStatus = status || "sent";

    // Update the lead with thread ID, subject, body, AND mark as sent or failed
    const updatedLead = await prisma.lead.update({
      where: { id: targetLeadId },
      data: {
        status: targetStatus,
        step: targetStatus === "sent" ? 1 : lead.step,
        ...(targetStatus === "sent" ? {
          sentAt: new Date(),
          nextFollowup: new Date(Date.now() + delay1Ms)
        } : {}),
        ...(threadId ? { gmailThreadId: threadId } : {}),
        ...(sentGmailAuthUser ? { sentGmailAuthUser: String(sentGmailAuthUser).trim() } : {}),
        ...(subject ? { sentSubject: subject } : {}),
        ...(emailBody ? { sentBody: emailBody } : {}),
      },
    });

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
