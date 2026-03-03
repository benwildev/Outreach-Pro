# Leads Dashboard AI Outreach – Chrome Extension

Manifest V3 Chrome extension that wires your Leads Dashboard **Send** button to: **ChatGPT** (generate email) → **Gmail** (compose and send).

## Flow

1. You click **Send** on a lead row in the dashboard.
2. Extension reads that row (Recipient Name, Email, Campaign, Step).
3. Opens **ChatGPT**, pastes a structured prompt, and sends it.
4. Waits for the reply, then parses **Subject:** and **Body:**.
5. Opens **Gmail** compose with To / Subject / Body pre-filled and clicks **Send**.

## Install (unpacked)

1. Open `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder.

## Permissions

- **tabs**, **scripting**, **activeTab** – open tabs and inject scripts.
- **chat.openai.com** – paste prompt and read response.
- **mail.google.com** – open compose and click Send.
- **localhost / your site** – read table and intercept Send (see `manifest.json`).

## Where it runs

- **Dashboard** (`content-dashboard.js`): runs on `http://localhost:3000/dashboard*` and `https://*/*/dashboard*`. Add your production URL in `manifest.json` if needed.
- **ChatGPT** (`content-chatgpt.js`): runs on `https://chat.openai.com/*`.
- **Gmail** (`content-gmail.js`): runs on `https://mail.google.com/*`.

## Custom domain

To support `https://yourdomain.com/dashboard`, ensure the dashboard URL is covered by `content_scripts[0].matches` in `manifest.json`. The pattern `https://*/*/dashboard*` already matches `https://yourdomain.com/dashboard`. For a single domain you can use:

```json
"matches": ["https://yourdomain.com/dashboard*"]
```

## Debugging

- **Dashboard**: DevTools (F12) on the dashboard page; logs prefixed `[Leads Extension Dashboard]`.
- **ChatGPT / Gmail**: DevTools on the ChatGPT or Gmail tab; logs prefixed `[Leads Extension ChatGPT]` or `[Leads Extension Gmail]`.
- **Background**: `chrome://extensions/` → your extension → **Service worker** → Inspect; logs and errors appear there.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest, permissions, content script matches |
| `background.js` | Service worker: starts workflow, opens tabs, message routing |
| `content-dashboard.js` | Listens for Send, extracts row, sends message to background |
| `content-chatgpt.js` | Receives prompt, pastes, sends, waits for reply, parses Subject/Body |
| `content-gmail.js` | Clicks Send in Gmail (compose pre-filled via URL) |
| `utils.js` | `buildPrompt()`, `parseEmailResponse()`, `delay()`, `log()` |
