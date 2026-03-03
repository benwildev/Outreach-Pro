const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLinks(html: string, leadId: string): string {
  if (!APP_URL) return html;
  const clickBase = `${APP_URL}/api/track/click`;
  return html.replace(
    /(<a\s+href=["'])(https?:\/\/[^"']+)(["'])/gi,
    (_, before, href: string, after) =>
      `${before}${clickBase}?leadId=${encodeURIComponent(leadId)}&url=${encodeURIComponent(href)}${after}`
  );
}

function wrapBareUrls(html: string, leadId: string): string {
  if (!APP_URL) return html;
  const clickBase = `${APP_URL}/api/track/click`;
  return html.replace(
    /(^|>|\s)(https?:\/\/[^\s<]+)(?=\s|$|<)/g,
    (_, before, url: string) =>
      `${before}<a href="${clickBase}?leadId=${encodeURIComponent(leadId)}&url=${encodeURIComponent(url)}">${url}</a>`
  );
}

export function buildTrackedBody(body: string, leadId: string): string {
  const hasHtml = /<[a-z][\s\S]*>/i.test(body);
  const htmlBody = hasHtml ? body : escapeHtml(body).replace(/\n/g, "<br>");
  const withHrefs = wrapLinks(htmlBody, leadId);
  const withBare = wrapBareUrls(withHrefs, leadId);
  const pixelUrl = APP_URL ? `${APP_URL}/api/track/open/${leadId}` : "";
  const pixel = pixelUrl
    ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;" />`
    : "";
  return `${withBare}\n${pixel}`;
}
