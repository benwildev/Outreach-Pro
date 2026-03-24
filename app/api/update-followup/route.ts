import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Called by the extension after the user has manually sent a follow-up from Gmail.
 * Updates the lead's step, sentAt, and nextFollowup (no email is sent by the server).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, sentGmailAuthUser } = body || {};
    console.log("/api/update-followup request:", JSON.stringify({ leadId, sentGmailAuthUser }));

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: String(leadId) },
      include: { campaign: true },
    });

    if (!lead) {
      console.error(`/api/update-followup: Lead not found: ${leadId}`);
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Robustness: if lead already progressed past the expected step, just return success
    if (lead.status === "replied" || (lead.status === "sent" && lead.step >= 3)) {
      console.log(`/api/update-followup: Lead ${leadId} already processed (status=${lead.status}, step=${lead.step}). Returning success.`);
      return NextResponse.json({ success: true, message: "Already updated", lead });
    }

    if (lead.status !== "sent") {
      console.warn(`/api/update-followup: Lead ${leadId} status is ${lead.status}, expected "sent". Proceeding anyway for robustness.`);
    }

    const campaign = lead.campaign;
    const followupSentAt = new Date();
    let stepUpdate: number;
    let nextFollowupUpdate: Date | null;
    let followup1BodyUpdate: string | null = null;
    let followup2BodyUpdate: string | null = null;

    if (lead.step === 1) {
      stepUpdate = 2;
      const delay2Days = campaign.delay2Days ?? 5;
      nextFollowupUpdate = new Date(followupSentAt);
      nextFollowupUpdate.setDate(followupSentAt.getDate() + delay2Days);
      nextFollowupUpdate.setHours(0, 0, 0, 0);
      followup1BodyUpdate = campaign.followup1 || null;
    } else if (lead.step === 2) {
      stepUpdate = 3;
      nextFollowupUpdate = null;
      followup2BodyUpdate = campaign.followup2 || null;
    } else {
      console.warn(`/api/update-followup: Lead ${leadId} is already at step ${lead.step}. No update needed.`);
      return NextResponse.json({ success: true, message: "No update needed", lead });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        step: stepUpdate,
        sentAt: followupSentAt,
        nextFollowup: nextFollowupUpdate,
        ...(followup1BodyUpdate ? { sentFollowup1Body: followup1BodyUpdate } : {}),
        ...(followup2BodyUpdate ? { sentFollowup2Body: followup2BodyUpdate } : {}),
        ...(sentGmailAuthUser ? { sentGmailAuthUser: String(sentGmailAuthUser).trim() } : {}),
      },
    });

    console.log(`/api/update-followup success: Lead ${leadId} updated to step ${stepUpdate}`);

    if (campaign.webhookUrl) {
      try {
        await fetch(campaign.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: lead.recipientEmail,
            followupDate: followupSentAt.toISOString(),
            isFollowup: true,
          }),
        });
        console.log(`[Webhook] Successfully triggered followup webhook for ${lead.recipientEmail}`);
      } catch (webhookError) {
        console.error(`[Webhook] Failed to trigger followup webhook for ${lead.recipientEmail}:`, webhookError);
        // Continue even if webhook fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Follow-up recorded",
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Error updating follow-up:", error);
    return NextResponse.json(
      { error: "Failed to record follow-up" },
      { status: 500 }
    );
  }
}
