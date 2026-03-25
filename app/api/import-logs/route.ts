import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const logs = await prisma.importLog.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const nextStartRow = logs.length > 0 ? logs[0].endRow + 1 : null;

  return NextResponse.json({ logs, nextStartRow });
}
