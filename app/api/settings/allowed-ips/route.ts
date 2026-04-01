import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const ips = await prisma.allowedIp.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(ips);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const ip = (body.ip ?? "").trim();
  const label = (body.label ?? "").trim() || null;

  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 });
  }

  try {
    const record = await prisma.allowedIp.create({ data: { ip, label } });
    return NextResponse.json(record, { status: 201 });
  } catch {
    return NextResponse.json({ error: "IP already exists or invalid" }, { status: 409 });
  }
}
