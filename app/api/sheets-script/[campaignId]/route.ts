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

  var numDataRows = lastRow - 1; // data starts at row 2
  var emailColIdx    = columnToIndex(EMAIL_COLUMN);
  var accountColIdx  = COLUMNS.OUTREACH_ACCOUNT ? columnToIndex(COLUMNS.OUTREACH_ACCOUNT) : -1;
  var sentColIdx     = COLUMNS.SENT_AT          ? columnToIndex(COLUMNS.SENT_AT)          : -1;
  var followupColIdx = COLUMNS.NEXT_FOLLOWUP    ? columnToIndex(COLUMNS.NEXT_FOLLOWUP)    : -1;
  var repliedColIdx  = COLUMNS.REPLIED          ? columnToIndex(COLUMNS.REPLIED)          : -1;

  // Read ONLY the email column — never touch other columns (preserves all formulas)
  var emailVals = sheet.getRange(2, emailColIdx, numDataRows, 1).getValues();

  // Read ONLY the 4 target columns so we can write them back as full-column arrays
  // (rows that don't match keep their existing values)
  var accountVals  = accountColIdx  >= 0 ? sheet.getRange(2, accountColIdx,  numDataRows, 1).getValues() : null;
  var sentVals     = sentColIdx     >= 0 ? sheet.getRange(2, sentColIdx,     numDataRows, 1).getValues() : null;
  var followupVals = followupColIdx >= 0 ? sheet.getRange(2, followupColIdx, numDataRows, 1).getValues() : null;
  var repliedVals  = repliedColIdx  >= 0 ? sheet.getRange(2, repliedColIdx,  numDataRows, 1).getValues() : null;

  var updated = 0;

  for (var r = 0; r < numDataRows; r++) {
    var cellEmail = String(emailVals[r][0] || "").toLowerCase().trim();
    if (!cellEmail || !leadMap[cellEmail]) continue;

    var lead = leadMap[cellEmail];

    if (accountVals)  accountVals[r][0]  = lead.sentFrom || "";
    if (sentVals)     sentVals[r][0]     = lead.sentAt       ? new Date(lead.sentAt)       : "";
    if (followupVals) followupVals[r][0] = lead.nextFollowup ? new Date(lead.nextFollowup) : "";
    if (repliedVals)  repliedVals[r][0]  = lead.replied;

    updated++;
  }

  // Write back ONLY the 4 target columns — all other columns (including any with
  // formulas like column D) are never read from as a whole range and never overwritten
  if (updated > 0) {
    if (accountVals)  sheet.getRange(2, accountColIdx,  numDataRows, 1).setValues(accountVals);
    if (sentVals)     sheet.getRange(2, sentColIdx,     numDataRows, 1).setValues(sentVals);
    if (followupVals) sheet.getRange(2, followupColIdx, numDataRows, 1).setValues(followupVals);
    if (repliedVals)  sheet.getRange(2, repliedColIdx,  numDataRows, 1).setValues(repliedVals);
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
