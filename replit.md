# Outreach Automation (Benwill Outreach System)

## Overview
A Next.js 14 outreach automation platform for managing email campaigns, leads, follow-ups, and reply tracking. Migrated from Vercel to Replit.

## Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL via Prisma ORM
- **Email**: Nodemailer (SMTP) + Gmail API
- **UI**: Tailwind CSS + Radix UI + shadcn/ui
- **Runtime**: Node.js 20

## Architecture
- `app/` — Next.js App Router pages and API routes
- `app/api/` — Server-side API routes (automation, send queue, tracking, follow-ups, etc.)
- `lib/` — Shared utilities (email, Prisma client, tracking, utils)
- `prisma/` — Prisma schema and migrations
- `components/` — Shared UI components

## Running the App
```bash
npm run dev   # dev server on 0.0.0.0:5000
npm run start # production server on 0.0.0.0:5000
```

## Environment Variables Required
| Key | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Neon or Replit DB) |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (for tracking pixels) |
| `CRON_SECRET` | Secret for securing cron job routes |
| `SMTP_HOST` | SMTP server host (optional) |
| `SMTP_PORT` | SMTP server port (optional) |
| `SMTP_USER` | SMTP username (optional) |
| `SMTP_PASS` | SMTP password (optional) |
| `GMAIL_CLIENT_ID` | Gmail OAuth2 client ID (optional) |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth2 client secret (optional) |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth2 refresh token (optional) |

## Replit Configuration
- Dev server binds to `0.0.0.0:5000` for Replit preview compatibility
- Workflow: "Start application" runs `npm run dev`
