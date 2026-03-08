import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, replyBody } = body || {};

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
        replied: true,
        status: "replied",
        nextFollowup: null,
        ...(replyBody ? { replyBody: String(replyBody).trim() } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Lead marked as replied",
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Error marking lead replied:", error);
    return NextResponse.json({ error: "Failed to mark replied" }, { status: 500 });
  }
}
