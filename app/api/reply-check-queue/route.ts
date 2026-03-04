import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || "30");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

    const leads = await prisma.lead.findMany({
      where: {
        status: "sent",
        replied: false,
        AND: [
          { gmailThreadId: { not: null } },
          { gmailThreadId: { not: "" } },
        ],
      },
      select: {
        id: true,
        recipientEmail: true,
        gmailThreadId: true,
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    console.error("Error building reply-check queue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build reply-check queue" },
      { status: 500 }
    );
  }
}
