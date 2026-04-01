import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  try {
    const record = await prisma.allowedIp.update({
      where: { id: params.id },
      data: { enabled },
    });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.allowedIp.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
