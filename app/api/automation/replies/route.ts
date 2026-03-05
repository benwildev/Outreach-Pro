import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getSenderEmail(headers: { name?: string | null; value?: string | null }[]): string | null {
  const from = headers.find((h) => (h.name ?? "").toLowerCase() === "from");
  const value = from?.value?.trim();
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && querySecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return NextResponse.json(
      { success: false, error: "Gmail API not configured (GMAIL_REFRESH_TOKEN, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)" },
      { status: 503 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      // Include read and unread messages; relying on unread-only misses replies once opened.
      q: "in:anywhere newer_than:180d",
    });

    const messages = list.data.messages ?? [];
    const replyByThread = new Map<string, Set<string>>(); // threadId -> senderEmail(s) lowercase
    const replyBySender = new Set<string>();

    for (const msg of messages) {
      const res = await gmail.users.messages.get({ userId: "me", id: msg.id! });
      const headers = res.data.payload?.headers ?? [];
      const sender = getSenderEmail(headers);
      const tid = res.data.threadId ?? undefined;
      if (sender) {
        const lower = sender.trim().toLowerCase();
        replyBySender.add(lower);
        if (tid) {
          const bucket = replyByThread.get(tid) ?? new Set<string>();
          bucket.add(lower);
          replyByThread.set(tid, bucket);
        }
      }
    }

    const leads = await prisma.lead.findMany({
      where: { replied: false, status: "sent" },
      select: { id: true, recipientEmail: true, gmailThreadId: true },
    });
    const idsToMark = leads.filter((l) => {
      const recipientLower = l.recipientEmail.trim().toLowerCase();
      if (l.gmailThreadId) {
        const sendersInThread = replyByThread.get(l.gmailThreadId);
        if (sendersInThread && sendersInThread.has(recipientLower)) {
          return true;
        }
      }
      return replyBySender.has(recipientLower);
    }).map((l) => l.id);

    if (idsToMark.length > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: idsToMark } },
        data: {
          replied: true,
          status: "replied",
          nextFollowup: null,
        },
      });
    }

    return NextResponse.json({ success: true, marked: idsToMark.length });
  } catch (err) {
    console.error("Replies detection error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Gmail API error" },
      { status: 500 }
    );
  }
}
