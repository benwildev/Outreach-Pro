import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { ClientDate } from "../ClientDate";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Zap, Plus, ArrowLeft, Mail, Clock, CheckCircle2, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

type CampaignRow = Prisma.CampaignGetPayload<{
  include: { _count: { select: { leads: true } } };
}> & {
  chatGptChatId?: string | null;
  gmailAuthUser?: string | null;
};

function subjectPreview(subject: string, maxLen = 40): string {
  if (subject.length <= maxLen) return subject;
  return subject.slice(0, maxLen) + "…";
}

export default async function DashboardCampaignsPage() {
  const [campaigns, totalLeads, sentCount, pendingCount, repliedCount] = await Promise.all([
    (prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
    }) as Promise<CampaignRow[]>),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "sent" } }),
    prisma.lead.count({ where: { status: "pending" } }),
    prisma.lead.count({ where: { status: "replied" } }),
  ]);

  const stats = [
    { label: "Total Leads", value: totalLeads, icon: Mail, color: "border-l-blue-500", iconBg: "bg-blue-500", valueColor: "text-blue-700" },
    { label: "Pending", value: pendingCount, icon: Clock, color: "border-l-amber-500", iconBg: "bg-amber-500", valueColor: "text-amber-700" },
    { label: "Sent", value: sentCount, icon: CheckCircle2, color: "border-l-emerald-500", iconBg: "bg-emerald-500", valueColor: "text-emerald-700" },
    { label: "Replied", value: repliedCount, icon: MessageSquare, color: "border-l-indigo-500", iconBg: "bg-indigo-500", valueColor: "text-indigo-700" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 shadow-xl">
        <div className="mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-2.5">
                <Zap className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Campaigns</h1>
                <p className="text-indigo-300 text-xs mt-0.5 font-medium">Manage your outreach campaigns</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/campaigns/new"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/80 rounded-lg px-3 py-2 transition-all duration-150 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                New Campaign
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Leads
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-6 py-6 max-w-6xl">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${stat.color} shadow-sm p-4 flex items-start justify-between`}>
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{stat.label}</p>
                  <p className={`text-3xl font-bold mt-2 ${stat.valueColor}`}>{stat.value.toLocaleString()}</p>
                </div>
                <div className={`${stat.iconBg} rounded-lg p-1.5 shadow-sm`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Campaigns table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50">
            <span className="text-sm font-semibold text-gray-800">All Campaigns</span>
            <span className="text-xs text-gray-400">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="overflow-x-auto">
            <Table className="[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3">
              <TableHeader>
                <TableRow className="border-b-2 border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Name</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Subject</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Chat ID</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Gmail Auth</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Leads</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Created</TableHead>
                  <TableHead className="text-[11px] font-bold text-gray-600 uppercase tracking-wide w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-gray-400 text-sm">
                      <div className="flex flex-col items-center gap-2 py-8">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">📋</div>
                        <span>No campaigns yet — create your first one</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((c, idx) => (
                    <TableRow
                      key={c.id}
                      className={`border-b border-gray-100 transition-colors hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                    >
                      <TableCell className="font-semibold text-gray-800 text-sm">{c.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-gray-500">{subjectPreview(c.subject)}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs font-mono text-gray-400">{c.chatGptChatId || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{c.gmailAuthUser || "0"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
                          {c._count.leads}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-400"><ClientDate date={c.createdAt} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/dashboard/campaigns/${c.id}`}
                            className="inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/dashboard?campaign=${c.id}`}
                            className="inline-flex items-center text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            Leads
                          </Link>
                          <DeleteCampaignButton campaignId={c.id} campaignName={c.name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
