import { NextRequest, NextResponse } from "next/server";

const DENIED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access Denied</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 50%, #eef2ff 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 2rem;
    }
    .card {
      background: #fff;
      border-radius: 1.25rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      border: 1px solid #fee2e2;
      padding: 3rem 2.5rem;
      max-width: 360px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .icon-wrap {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: #fef2f2;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.5rem;
    }
    svg { width: 2rem; height: 2rem; color: #ef4444; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #111827; }
    p { font-size: 0.875rem; color: #6b7280; line-height: 1.6; }
    .badge {
      margin-top: 0.5rem;
      padding: 0.375rem 0.75rem;
      border-radius: 0.5rem;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      font-size: 0.75rem;
      font-weight: 700;
      color: #dc2626;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    </div>
    <h1>Access Denied</h1>
    <p>Your IP address is not authorized to access this application. Please contact your administrator if you believe this is a mistake.</p>
    <div class="badge">403 Forbidden</div>
  </div>
</body>
</html>`;

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

  return new NextResponse(DENIED_HTML, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config = {
  matcher: [
    "/((?!denied|_next/static|_next/image|favicon.ico|icon.png|logo.png).*)",
  ],
};
