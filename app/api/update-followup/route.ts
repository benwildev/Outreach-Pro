import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Called by the extension after the user has manually sent a follow-up from Gmail.
 * Updates the lead's step, sentAt, and nextFollowup (no email is sent by the server).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, sentGmailAuthUser } = body;

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { campaign: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status !== "sent") {
      return NextResponse.json(
        { error: "Lead must be in sent status" },
        { status: 400 }
      );
    }

    if (lead.step >= 3) {
      return NextResponse.json(
        { error: "No more follow-ups for this lead" },
        { status: 400 }
      );
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
    } else {
      stepUpdate = 3;
      nextFollowupUpdate = null;
      followup2BodyUpdate = campaign.followup2 || null;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        step: stepUpdate,
        sentAt: followupSentAt,
        nextFollowup: nextFollowupUpdate,
        ...(followup1BodyUpdate ? { sentFollowup1Body: followup1BodyUpdate } : {}),
        ...(followup2BodyUpdate ? { sentFollowup2Body: followup2BodyUpdate } : {}),
        ...(sentGmailAuthUser ? { sentGmailAuthUser: String(sentGmailAuthUser).trim() } : {}),
      },
    });

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
