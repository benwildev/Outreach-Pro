import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.toLowerCase().trim() || "";

    if (email) {
      const row = await prisma.gmailAccountMap.findUnique({ where: { email } });
      if (!row) return NextResponse.json({ found: false });
      return NextResponse.json({ found: true, accountIndex: String(row.accountIndex), source: row.source });
    }

    const rows = await prisma.gmailAccountMap.findMany({
      orderBy: { accountIndex: "asc" },
    });
    return NextResponse.json({ success: true, accounts: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) });
  } catch (error) {
    console.error("GET /api/gmail-account-map error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const accountIndex = parseInt(String(body.accountIndex ?? ""), 10);
    const source = String(body.source ?? "manual").trim();

    if (!email.includes("@") || Number.isNaN(accountIndex) || accountIndex < 0) {
      return NextResponse.json({ success: false, error: "Invalid email or accountIndex" }, { status: 400 });
    }

    const row = await prisma.gmailAccountMap.upsert({
      where: { email },
      update: { accountIndex, source },
      create: { email, accountIndex, source },
    });

    return NextResponse.json({ success: true, account: { ...row, updatedAt: row.updatedAt.toISOString() } });
  } catch (error) {
    console.error("POST /api/gmail-account-map error:", error);
    return NextResponse.json({ success: false, error: "Failed to upsert" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.toLowerCase().trim() || "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "email query param required" }, { status: 400 });
    }
    await prisma.gmailAccountMap.delete({ where: { email } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/gmail-account-map error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
