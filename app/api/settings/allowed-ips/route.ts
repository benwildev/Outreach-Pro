import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const IPV4_RE =
  /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip);
}

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

  if (!isValidIp(ip)) {
    return NextResponse.json(
      { error: "Invalid IP address — must be a valid IPv4 or IPv6 address" },
      { status: 400 }
    );
  }

  try {
    const record = await prisma.allowedIp.create({ data: { ip, label } });
    return NextResponse.json(record, { status: 201 });
  } catch {
    return NextResponse.json({ error: "IP already exists" }, { status: 409 });
  }
}
