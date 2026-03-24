import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, bounceReason } = body || {};

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: String(leadId) },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: "bounced",
        nextFollowup: null,
      },
    });

    console.log(`[Email Bounced] Lead: ${leadId} | Reason: ${bounceReason || "Unknown"}`);

    return NextResponse.json({
      success: true,
      message: "Lead marked as bounced",
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Error marking lead bounced:", error);
    return NextResponse.json({ error: "Failed to mark bounced" }, { status: 500 });
  }
}
