import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaign } from "../actions";
import { Zap, ArrowLeft, Download, Sheet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 shadow-xl">
        <div className="mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-2.5">
                <Zap className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Edit Campaign</h1>
                <p className="text-indigo-300 text-xs mt-0.5 font-medium">{campaign.name}</p>
              </div>
            </div>
            <Link
              href="/dashboard/campaigns"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Campaigns
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto px-6 py-6 max-w-2xl space-y-5">
        {/* Google Sheets sync card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50/50 flex items-center gap-2">
            <Sheet className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-gray-800">Google Sheets Sync</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              Download the Apps Script file and paste it into your Google Sheet to sync lead status, sent dates, reply info, and Gmail thread links back into your sheet.
            </p>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Save the Google Sheet URL in the field below, then click <strong>Save Changes</strong></li>
              <li>Download the Apps Script below</li>
              <li>Open your Google Sheet → <strong>Extensions → Apps Script</strong></li>
              <li>Paste the code, click Save, then run <code className="bg-gray-100 px-1 rounded font-mono text-xs">syncBenwillData()</code></li>
            </ol>
            <a
              href={`/api/sheets-script/${campaign.id}`}
              download
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-500 border border-green-500/80 rounded-lg px-4 py-2 transition-all duration-150 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Apps Script (.gs)
            </a>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50">
            <h2 className="text-sm font-semibold text-gray-800">Campaign Details</h2>
          </div>
          <form action={updateCampaign.bind(null, id)} className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaign Name *</Label>
                <Input id="name" name="name" defaultValue={campaign.name} required placeholder="Campaign name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Subject Line *</Label>
                <Input id="subject" name="subject" defaultValue={campaign.subject} required placeholder="Email subject" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="chatGptChatId" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">ChatGPT Chat ID / URL</Label>
                <Input id="chatGptChatId" name="chatGptChatId" defaultValue={campaign.chatGptChatId ?? ""} placeholder="e.g. c69a83496..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmailAuthUser" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Gmail Auth User</Label>
                <Input id="gmailAuthUser" name="gmailAuthUser" defaultValue={campaign.gmailAuthUser ?? ""} placeholder="e.g. nick@gmail.com" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Email Body *</Label>
              <Textarea id="body" name="body" defaultValue={campaign.body} required rows={6} placeholder="Your outreach email template..." className="resize-none" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="followup1" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Follow-up 1 Body</Label>
                <Textarea id="followup1" name="followup1" defaultValue={campaign.followup1 ?? ""} rows={4} placeholder="First follow-up message" className="resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup2" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Follow-up 2 Body</Label>
                <Textarea id="followup2" name="followup2" defaultValue={campaign.followup2 ?? ""} rows={4} placeholder="Second follow-up message" className="resize-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signature" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Signature</Label>
              <Textarea id="signature" name="signature" defaultValue={campaign.signature ?? ""} rows={3} placeholder="Signature appended to every email" className="resize-none" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="webhookUrl" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Webhook URL</Label>
              <Input id="webhookUrl" name="webhookUrl" defaultValue={campaign.webhookUrl ?? ""} placeholder="Google Apps Script or Make.com webhook" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="googleSheetId" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Google Sheet URL (for Sync)</Label>
              <Input id="googleSheetId" name="googleSheetId" defaultValue={campaign.googleSheetId ?? ""} placeholder="Paste your Google Sheet URL here" />
              <p className="text-xs text-gray-400">Paste the full URL of your Google Sheet. Used by the &quot;Sync to Sheet&quot; button to match rows by email.</p>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="delay1Days" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Follow-up 1 Delay (days)</Label>
                <Input id="delay1Days" name="delay1Days" type="number" min={0} defaultValue={campaign.delay1Days} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delay2Days" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Follow-up 2 Delay (days)</Label>
                <Input id="delay2Days" name="delay2Days" type="number" min={0} defaultValue={campaign.delay2Days} required />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/80 rounded-lg px-5 py-2.5 transition-all duration-150 shadow-sm"
              >
                Save Changes
              </button>
              <Link
                href="/dashboard/campaigns"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 rounded-lg px-5 py-2.5 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
