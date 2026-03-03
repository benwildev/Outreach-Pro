import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");
  const url = searchParams.get("url");

  if (!leadId || !url) {
    return new NextResponse("Invalid", { status: 400 });
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      clicked: true,
      clickedAt: new Date(),
    },
  }).catch(() => null);

  try {
    const decoded = decodeURIComponent(url);
    return NextResponse.redirect(decoded.startsWith("http") ? decoded : `https://${decoded}`);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }
}
