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

    if (lead.step === 1) {
      stepUpdate = 2;
      const delay2Ms = (campaign.delay2Days ?? 5) * 24 * 60 * 60 * 1000;
      nextFollowupUpdate = new Date(followupSentAt.getTime() + delay2Ms);
    } else {
      stepUpdate = 3;
      nextFollowupUpdate = null;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        step: stepUpdate,
        sentAt: followupSentAt,
        nextFollowup: nextFollowupUpdate,
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
