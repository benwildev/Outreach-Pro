-- Migration: add followup1Templates column to campaign
-- Run: PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDATABASE -f prisma/migrations/add_followup1_templates.sql
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS "followup1Templates" TEXT;
