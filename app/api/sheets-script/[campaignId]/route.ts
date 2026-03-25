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
  REPLIED:         "O"   // Got Reply column — writes Yes / No
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
    leadMap[lead.email.toLowerCase().trim()] = lead;
  });

  var lastRow = sheet.getLastRow();
  var emailColIndex = columnToIndex(EMAIL_COLUMN);
  var updated = 0;

  for (var row = 2; row <= lastRow; row++) {
    var cellEmail = String(sheet.getRange(row, emailColIndex).getValue() || "").toLowerCase().trim();
    if (!cellEmail || !leadMap[cellEmail]) continue;

    var lead = leadMap[cellEmail];

    if (COLUMNS.OUTREACH_ACCOUNT)
      sheet.getRange(row, columnToIndex(COLUMNS.OUTREACH_ACCOUNT)).setValue(lead.sentFrom || "");

    if (COLUMNS.SENT_AT)
      sheet.getRange(row, columnToIndex(COLUMNS.SENT_AT)).setValue(lead.sentAt ? new Date(lead.sentAt) : "");

    if (COLUMNS.NEXT_FOLLOWUP)
      sheet.getRange(row, columnToIndex(COLUMNS.NEXT_FOLLOWUP)).setValue(lead.nextFollowup ? new Date(lead.nextFollowup) : "");

    if (COLUMNS.REPLIED)
      sheet.getRange(row, columnToIndex(COLUMNS.REPLIED)).setValue(lead.replied);

    updated++;
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
