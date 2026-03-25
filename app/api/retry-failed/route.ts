import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : null;

    const result = await prisma.lead.updateMany({
      where: {
        status: "failed",
        ...(campaignId ? { campaignId } : {}),
      },
      data: { status: "pending" },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
