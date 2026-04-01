import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const allowedIpsEnv = process.env.ALLOWED_IPS ?? "";

  if (!allowedIpsEnv.trim()) {
    return NextResponse.next();
  }

  const allowedIps = allowedIpsEnv
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : request.ip ?? "";

  if (allowedIps.includes(clientIp)) {
    return NextResponse.next();
  }

  const deniedUrl = new URL("/denied", request.url);
  return NextResponse.redirect(deniedUrl, { status: 307 });
}

export const config = {
  matcher: [
    "/((?!denied|_next/static|_next/image|favicon.ico|icon.png|logo.png).*)",
  ],
};
