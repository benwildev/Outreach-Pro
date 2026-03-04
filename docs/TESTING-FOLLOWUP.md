# Testing follow-ups

## Quick test (no waiting)

1. **Create or edit a campaign** (Dashboard → Manage Campaigns):
   - Set **Delay 1 (days)** to **0** (and optionally Delay 2 to **0**).
   - Fill in **Follow-up 1 Body** (required for first follow-up).
   - Save.

2. **Add a lead** to that campaign and **send the first email** (via the dashboard “Send” or your extension).

3. **Open the dashboard** and go to the **“Follow-up Due”** tab (or find the lead in “All” – it will show a red “Due” badge).

4. **Click “Send Follow-up”** on that lead. The follow-up email is sent and the lead moves to the next step.

## Test with real delays

- Use **Delay 1 = 3** and **Delay 2 = 5** (or any number). After sending the first email, the lead will appear under “Follow-up Due” when the delay has passed (e.g. after 3 days for the first follow-up).

## Make an existing lead due now (database)

If you already have a lead with status **sent** and want to test follow-up without waiting:

```sql
-- Replace YOUR_LEAD_ID with the lead id from the dashboard
UPDATE "Lead"
SET "nextFollowup" = NOW() - INTERVAL '1 minute'
WHERE id = 'YOUR_LEAD_ID' AND status = 'sent';
```

Then refresh the dashboard and use **“Follow-up Due”** → **“Send Follow-up”**.
