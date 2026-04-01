import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [ips, setting] = await Promise.all([
    prisma.allowedIp.findMany({
      where: { enabled: true },
      select: { ip: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "ip_restriction_enabled" } }),
  ]);

  const enabled = setting ? setting.value === "true" : false;

  return NextResponse.json({
    enabled,
    ips: ips.map((r) => r.ip),
  });
}
