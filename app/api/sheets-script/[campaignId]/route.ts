import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin);

  const dataUrl = `${appUrl}/api/sheets-data?campaignId=${campaignId}`;

  const script = `// ============================================================
// Benwill Outreach System — Google Sheets Sync Script
// Campaign: ${campaign.name}
// Generated: ${new Date().toISOString()}
//
// HOW TO USE:
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Paste this entire file and click Save (disk icon)
// 4. Click Run > syncBenwillData to sync now
// 5. Optional: Triggers > Add Trigger > syncBenwillData (time-based)
// ============================================================

var BENWILL_API_URL = "${dataUrl}";

// Column mapping — update these letters if your layout differs
//   L = Outreach account  |  M = Date sent  |  N = Follow up  |  O = Got Reply
var EMAIL_COLUMN = "J";  // Column with email addresses (used for row matching)
var COLUMNS = {
  OUTREACH_ACCOUNT:"L",  // Outreach account — Gmail account used to send
  SENT_AT:         "M",  // Date column — writes the sent date
  NEXT_FOLLOWUP:   "N",  // Follow up column — writes next follow-up date
  REPLIED:         "O"   // Got Reply column — writes YES / NO
};

function syncBenwillData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var response = UrlFetchApp.fetch(BENWILL_API_URL);
  var data = JSON.parse(response.getContentText());
  var leads = data.leads || [];

  if (leads.length === 0) {
    SpreadsheetApp.getUi().alert("No lead data found for this campaign.");
    return;
  }

  // Build email → lead lookup map
  var leadMap = {};
  leads.forEach(function(lead) {
    var emailStr = lead.emails || lead.email || "";
    var emails = emailStr.split(",");
    emails.forEach(function(em) {
      var clean = em.toLowerCase().trim();
      if (clean) leadMap[clean] = lead;
    });
  });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var emailColIndex = columnToIndex(EMAIL_COLUMN) - 1; // 0-indexed
  var accountIdx = COLUMNS.OUTREACH_ACCOUNT ? columnToIndex(COLUMNS.OUTREACH_ACCOUNT) - 1 : -1;
  var sentIdx = COLUMNS.SENT_AT ? columnToIndex(COLUMNS.SENT_AT) - 1 : -1;
  var followupIdx = COLUMNS.NEXT_FOLLOWUP ? columnToIndex(COLUMNS.NEXT_FOLLOWUP) - 1 : -1;
  var repliedIdx = COLUMNS.REPLIED ? columnToIndex(COLUMNS.REPLIED) - 1 : -1;

  var maxColIdx = Math.max(emailColIndex, accountIdx, sentIdx, followupIdx, repliedIdx) + 1;
  var targetLastCol = Math.max(sheet.getLastColumn(), maxColIdx);
  
  // Batch read
  var range = sheet.getRange(1, 1, lastRow, targetLastCol);
  var values = range.getValues();
  var updated = 0;

  for (var r = 1; r < lastRow; r++) { // skip header row 0
    var cellEmail = String(values[r][emailColIndex] || "").toLowerCase().trim();
    if (!cellEmail || !leadMap[cellEmail]) continue;

    var lead = leadMap[cellEmail];

    if (accountIdx >= 0) values[r][accountIdx] = lead.sentFrom || "";
    if (sentIdx >= 0) values[r][sentIdx] = lead.sentAt ? new Date(lead.sentAt) : "";
    if (followupIdx >= 0) values[r][followupIdx] = lead.nextFollowup ? new Date(lead.nextFollowup) : "";
    if (repliedIdx >= 0) values[r][repliedIdx] = lead.replied;

    updated++;
  }

  // Batch write
  if (updated > 0) {
    range.setValues(values);
  }

  SpreadsheetApp.getUi().alert(
    "Sync complete!\\nUpdated " + updated + " row(s).\\nLast synced: " + new Date().toLocaleString()
  );
}

// ---- helpers ----

function columnToIndex(col) {
  var n = 0;
  for (var i = 0; i < col.length; i++) {
    n = n * 26 + col.charCodeAt(i) - 64;
  }
  return n;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`;

  const filename = `benwill-sync-${campaign.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.gs`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
