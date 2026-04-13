import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await prisma.gmailAccountMap.findMany({
      orderBy: { accountIndex: "asc" },
      select: { email: true, accountIndex: true },
    });
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("Error fetching Gmail accounts:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch accounts" }, { status: 500 });
  }
}
