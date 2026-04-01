import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/getAnalytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = (url.searchParams.get("campaignId") ?? "").trim();
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "30"), 7), 90);
    const data = await getAnalytics(days, campaignId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ success: false, error: "Failed to load analytics" }, { status: 500 });
  }
}
