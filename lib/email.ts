import nodemailer from "nodemailer";
import { google } from "googleapis";

export type SendEmailOptions = {
  provider: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  /** When set and provider is gmail_api, the message is sent as a reply in this thread. */
  threadId?: string;
};

export type SendEmailResult =
  | { type: "redirect"; url: string }
  | { type: "success"; threadId?: string };

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { provider, to, subject, body, html, threadId } = options;
  const content = html ?? body;

  if (provider === "gmail_api") {
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error("Gmail API not configured. Set GMAIL_REFRESH_TOKEN, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET.");
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const fromEmail = profile.data.emailAddress || "noreply@localhost";
    const raw = buildMimeMessage({ from: fromEmail, to, subject, html: content || body });
    const encoded = Buffer.from(raw)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded, threadId: threadId || undefined },
    });
    const id = res.data.threadId ?? res.data.id ?? undefined;
    return { type: "success", threadId: id };
  }

  if (provider === "gmail_manual" || provider === "gmail") {
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
    return { type: "redirect", url };
  }

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transport.sendMail({
      from: user,
      to,
      subject,
      text: body,
      ...(html ? { html } : {}),
    });

    return { type: "success" };
  }

  throw new Error(`Unknown email provider: ${provider}`);
}

function buildMimeMessage(args: { from: string; to: string; subject: string; html: string }): string {
  const { from, to, subject, html } = args;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject.replace(/\r?\n/g, " ")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ];
  return lines.join("\r\n");
}
