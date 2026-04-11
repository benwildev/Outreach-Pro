# Benwill Outreach System

## Overview
A cold outreach automation platform that manages email campaigns and leads. It integrates with a Chrome Extension to orchestrate workflows between ChatGPT (for AI-powered email personalization) and Gmail (for delivery).

## Architecture

### Web Dashboard (Next.js 14)
- **Framework:** Next.js 14 with App Router, React 18, TypeScript
- **Styling:** Tailwind CSS, Radix UI components, Lucide React icons
- **Database:** PostgreSQL via Prisma ORM (Replit's built-in PostgreSQL)
- **Port:** 5000 (dev), mapped to external port 80

### Key Directories
- `app/` - Next.js App Router pages and API routes
  - `app/dashboard/` - Main UI for leads, campaigns, settings
  - `app/api/` - Backend API endpoints (tracking, automation, sheets data, settings)
- `prisma/` - Database schema and migrations
- `lib/` - Shared utilities (prisma.ts, email.ts, tracking.ts)
- `components/` - Reusable UI components
- `extension/` - Chrome Extension source (loaded separately in Chrome)

### Chrome Extension
Located in `extension/`, must be loaded as an unpacked extension in Chrome developer mode. It automates ChatGPT and Gmail tabs to generate and send personalized emails.

## Database Setup
Uses Replit's built-in PostgreSQL. The `lib/prisma.ts` auto-builds `DATABASE_URL` from individual `PG*` environment variables set by Replit.

To sync schema: `DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:${PGPORT:-5432}/$PGDATABASE" npx prisma db push`

## Running the App
The "Start application" workflow runs `npm run dev` which starts Next.js on port 5000.

## Environment Variables
- `DATABASE_URL` / `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - Auto-set by Replit
- `NEXT_PUBLIC_APP_URL` - Public URL for tracking pixels (set in .replit userenv)
- `SMTP_HOST/PORT/USER/PASS` - Optional SMTP for non-Gmail campaigns
- `CRON_SECRET` - For Vercel cron job authentication
- `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` - For Gmail API reply detection
- `ALLOWED_IPS` - Optional IP allowlist (comma-separated)

## Key Features
- Campaign management with email templates and follow-up sequences
- Lead import via file upload or Google Sheets
- AI email personalization via ChatGPT (through Chrome Extension)
- Gmail automation for sending (through Chrome Extension)
- Email tracking (open/click pixels)
- Automated reply detection
