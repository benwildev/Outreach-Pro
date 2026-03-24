import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [repliedCount, todaySentCount] = await Promise.all([
    prisma.lead.count({ where: { status: "replied" } }),
    prisma.lead.count({ where: { sentAt: { gte: todayStart } } }),
  ]);

  return NextResponse.json({ repliedCount, todaySentCount });
}
