import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UNSUBSCRIBE_PHRASES = [
  "unsubscribe", "remove me", "remove my email", "take me off", "opt out",
  "opt-out", "please stop", "stop emailing", "do not email", "don't email",
  "dont email", "don't contact", "do not contact", "not interested",
  "no thanks", "no thank you", "i'm not interested", "im not interested",
];

const POSITIVE_PHRASES = [
  "interested", "tell me more", "love to", "would love", "let's connect",
  "lets connect", "let's chat", "lets chat", "sounds good", "yes please",
  "please send", "can you share", "i'd like", "id like", "happy to",
  "great opportunity", "looking forward", "when can we", "schedule a call",
  "book a call", "set up a call", "book a meeting",
];

const OOO_PHRASES = [
  "out of office", "out of the office", "on vacation", "on leave",
  "away from", "will be back", "will return", "auto-reply",
  "automatic reply", "autoreply", "away until", "currently unavailable",
  "i am away", "currently out",
];

function classifyReply(body: string): "unsubscribe" | "negative" | "ooo" | "positive" {
  if (!body) return "positive";
  const lower = body.toLowerCase();
  if (UNSUBSCRIBE_PHRASES.some((p) => lower.includes(p))) return "unsubscribe";
  if (OOO_PHRASES.some((p) => lower.includes(p))) return "ooo";
  if (POSITIVE_PHRASES.some((p) => lower.includes(p))) return "positive";
  const trimmed = lower.trim();
  if (trimmed === "no" || trimmed.startsWith("no,") || trimmed.startsWith("not interested")) {
    return "negative";
  }
  return "positive";
}

async function fireWebhook(webhookUrl: string, payload: object): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Webhook failures are silent — never block reply marking.
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, replyBody } = body || {};

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: String(leadId) },
      include: { campaign: { select: { webhookUrl: true, name: true } } },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const replyText = replyBody ? String(replyBody).trim() : "";
    const category = classifyReply(replyText);
    const isUnsubscribe = category === "unsubscribe" || category === "negative";

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        replied: true,
        status: "replied",
        nextFollowup: null,
        replyCategory: category,
        unsubscribed: isUnsubscribe,
        ...(replyText ? { replyBody: replyText } : {}),
      },
    });

    // Fire webhook in the background — never delay the response.
    const webhookUrl = lead.campaign?.webhookUrl;
    if (webhookUrl && webhookUrl.startsWith("http")) {
      void fireWebhook(webhookUrl, {
        event: "reply_received",
        leadId: lead.id,
        recipientEmail: lead.recipientEmail,
        recipientName: lead.recipientName,
        campaignName: lead.campaign?.name ?? "",
        replyCategory: category,
        unsubscribed: isUnsubscribe,
        replyBody: replyText || null,
        repliedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Lead marked as replied",
      replyCategory: category,
      unsubscribed: isUnsubscribe,
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Error marking lead replied:", error);
    return NextResponse.json({ error: "Failed to mark replied" }, { status: 500 });
  }
}
