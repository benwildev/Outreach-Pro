import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const leadId = url.searchParams.get("leadId");

        if (!leadId) {
            return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
        }

        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                step: true,
                replied: true,
                status: true,
                recipientEmail: true,
            },
        });

        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        // Determine if the lead is in a valid state to receive a follow-up right now
        // If they already replied, or if step >= 3, they shouldn't receive a follow-up.
        const isEligibleForFollowup = lead.status === "sent" && !lead.replied && lead.step < 3;

        return NextResponse.json({
            success: true,
            eligible: isEligibleForFollowup,
            lead,
        });
    } catch (error) {
        console.error("Error validating lead for follow-up:", error);
        return NextResponse.json(
            { success: false, error: "Validation failed" },
            { status: 500 }
        );
    }
}
