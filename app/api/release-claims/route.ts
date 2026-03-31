import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Clear the claimedAt lock on all pending leads so they can be fetched again.
// Call this when automation was interrupted by a network drop and you want to
// restart immediately without waiting for the 5-minute lock to expire.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";

    const where: { status: string; claimedAt: { not: null }; campaignId?: string } = {
      status: "pending",
      claimedAt: { not: null },
    };
    if (campaignId) {
      where.campaignId = campaignId;
    }

    const result = await prisma.lead.updateMany({
      where,
      data: { claimedAt: null },
    });

    console.log(`[release-claims] Released ${result.count} claim lock(s)${campaignId ? ` for campaign ${campaignId}` : ""}`);

    return NextResponse.json({
      success: true,
      released: result.count,
      message: result.count > 0
        ? `Released ${result.count} locked lead(s) — ready to send`
        : "No locked leads found",
    });
  } catch (error) {
    console.error("Error releasing claims:", error);
    return NextResponse.json({ success: false, error: "Failed to release claim locks" }, { status: 500 });
  }
}
