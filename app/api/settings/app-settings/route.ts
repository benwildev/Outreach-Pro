import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const IP_RESTRICTION_KEY = "ip_restriction_enabled";

export async function GET() {
  const setting = await prisma.appSetting.findUnique({ where: { key: IP_RESTRICTION_KEY } });
  const enabled = setting ? setting.value === "true" : false;
  return NextResponse.json({ ip_restriction_enabled: enabled });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { ip_restriction_enabled } = body;

  if (typeof ip_restriction_enabled !== "boolean") {
    return NextResponse.json({ error: "ip_restriction_enabled (boolean) is required" }, { status: 400 });
  }

  await prisma.appSetting.upsert({
    where: { key: IP_RESTRICTION_KEY },
    create: { key: IP_RESTRICTION_KEY, value: String(ip_restriction_enabled) },
    update: { value: String(ip_restriction_enabled) },
  });

  return NextResponse.json({ ip_restriction_enabled });
}
