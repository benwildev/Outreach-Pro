import nodemailer from "nodemailer";

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
  const { provider, to, subject, body, html } = options;
  const content = html ?? body;

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
