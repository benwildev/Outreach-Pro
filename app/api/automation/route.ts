import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildTrackedBody } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const valid = auth === `Bearer ${secret}` || querySecret === secret;
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  const leads = await prisma.lead.findMany({
    where: {
      status: "sent",
      replied: false,
      nextFollowup: { lte: now },
      campaign: { provider: "smtp" }
    },
    include: { campaign: true },
  });

  for (const lead of leads) {
    const followupSentAt = new Date();
    let body = "";
    let nextDelay: number | null = null;

    if (lead.step === 1 && lead.campaign.followup1?.trim()) {
      body = lead.campaign.followup1.trim();
      nextDelay = lead.campaign.delay2Days;
    } else if (lead.step === 2 && lead.campaign.followup2?.trim()) {
      body = lead.campaign.followup2.trim();
      nextDelay = null;
    }

    if (!body) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { nextFollowup: null },
      });
      continue;
    }

    const provider = lead.campaign.provider === "smtp" ? "smtp" : "gmail_manual";

    const trackedBody = buildTrackedBody(body, lead.id);
    try {
      await sendEmail({
        provider,
        to: lead.recipientEmail,
        subject: `Re: ${lead.campaign.subject}`,
        body,
        html: trackedBody,
      });
    } catch (err) {
      console.error(`Automation: send failed for lead ${lead.id}`, err);
      continue;
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        step: lead.step + 1,
        sentAt: followupSentAt,
        nextFollowup: nextDelay != null
          ? new Date(followupSentAt.getTime() + nextDelay * 86400000)
          : null,
      },
    });
  }

  return NextResponse.json({ success: true });
}
