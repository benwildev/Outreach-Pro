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

## Database Configuration
- App uses Replit's internal PostgreSQL (`heliumdb` via PGHOST/PGUSER/PGPASSWORD/PGDATABASE env vars), NOT the Neon DATABASE_URL
- `lib/prisma.ts` overrides DATABASE_URL with PGHOST vars at runtime
- To apply schema changes, use `psql` directly: `PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDATABASE`
- Schema tables: `campaign`, `lead`, `import_log` (lowercase with @@map in Prisma)

## Key Features
- Bulk send automation with delay controls, daily limits, and domain throttle (max sends per domain per run)
- Gmail OAuth via Chrome extension orchestrating ChatGPT → Gmail workflows
- Follow-up scheduling (2-level) with reply tracking; unsubscribed leads blocked from follow-up queue
- Reply categorization: auto-classifies replies as "positive", "ooo", "negative", or "unsubscribe" (stored in `replyCategory`); unsubscribe/negative set `unsubscribed=true`
- Webhook notifications: fires `campaign.webhookUrl` POST on reply with category + lead info
- Import tracking: CSV/Excel imports logged per-campaign with start row resumption; skipped duplicates surfaced in UI
- Google Sheets sync via Apps Script snippet (no direct Google API — user preference)
- Analytics page (`/analytics`): sends/day chart, reply rates, account performance, campaign breakdown with pure CSS bar charts

## Lead Schema New Columns (added)
- `reply_category VARCHAR` — reply classification: positive | ooo | negative | unsubscribe
- `unsubscribed BOOLEAN DEFAULT false` — set true when negative/unsubscribe reply detected

## Replit Configuration
- Dev server binds to `0.0.0.0:5000` for Replit preview compatibility
- Workflow: "Start application" runs `npm run dev`
