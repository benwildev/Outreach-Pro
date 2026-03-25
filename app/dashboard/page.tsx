import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { AddLeadDialog } from "./AddLeadDialog";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { StatsCards } from "./StatsCards";
import { DailySendTracker } from "./DailySendTracker";
import { BulkAutomationPanel } from "./BulkAutomationPanel";
import { BulkSchedulePanel } from "./BulkSchedulePanel";
import { BulkActionsRow } from "./BulkActionsRow";
import { LeadsTableClient } from "./LeadsTableClient";
import { AdvancedFilters } from "./AdvancedFilters";
import { Settings, Download, FileDown, Zap, LayoutDashboard } from "lucide-react";

const VALID_STATUSES = ["pending", "sent", "scheduled", "replied"] as const;
const PAGE_SIZE = 50;

type LeadRow = Prisma.LeadGetPayload<{
  include: { campaign: true };
}> & {
  sentGmailAuthUser?: string | null;
};

interface DashboardPageProps {
  searchParams: {
    status?: string;
    filter?: string;
    campaign?: string;
    email?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const statusFilter = searchParams.status?.toLowerCase();
  const status =
    statusFilter && VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number])
      ? statusFilter
      : null;
  const filter = searchParams.filter ?? null;
  const campaignId = searchParams.campaign ?? null;
  const emailSearch = searchParams.email?.trim() ?? null;
  const dateFrom = searchParams.dateFrom ?? null;
  const dateTo = searchParams.dateTo ?? null;

  const campaigns = await prisma.campaign.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isFollowUpDueFilter = filter === "followup-due";
  const where: Prisma.LeadWhereInput = {};

  if (campaignId) where.campaignId = campaignId;

  if (isFollowUpDueFilter) {
    where.status = "sent";
    where.nextFollowup = { lte: new Date() };
  } else if (status) {
    where.status = status;
  }

  if (emailSearch) {
    where.recipientEmail = { contains: emailSearch, mode: "insensitive" };
  }

  if (dateFrom || dateTo) {
    const sentAtFilter: Prisma.DateTimeNullableFilter = {};
    if (dateFrom) sentAtFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) sentAtFilter.lte = new Date(dateTo + "T23:59:59");
    where.sentAt = sentAtFilter;
  }

  const leads = (await prisma.lead.findMany({
    where,
    orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
    take: PAGE_SIZE,
    include: { campaign: true },
  })) as LeadRow[];

  const [totalLeads, sentLeads, repliedLeads, pendingLeads, bouncedLeads, scheduledLeads] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "sent" } }),
    prisma.lead.count({ where: { status: "replied" } }),
    prisma.lead.count({ where: { status: "pending" } }),
    prisma.lead.count({ where: { status: "bounced" } }),
    prisma.lead.count({ where: { status: "scheduled" } }),
  ]);

  const followupDueLeads = await prisma.lead.findMany({
    where: { status: "sent", nextFollowup: { lte: new Date() } },
  });
  const followupDueCount = followupDueLeads.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySentLeads = await prisma.lead.findMany({
    where: {
      sentAt: { gte: todayStart },
      sentGmailAuthUser: { not: null },
    },
    select: { sentGmailAuthUser: true },
  });
  const accountCountMap: Record<string, number> = {};
  for (const l of todaySentLeads) {
    const acct = l.sentGmailAuthUser ?? "unknown";
    accountCountMap[acct] = (accountCountMap[acct] ?? 0) + 1;
  }
  const dailyAccountStats = Object.entries(accountCountMap).map(([account, count]) => ({
    account,
    count,
  }));

  const exportParams = new URLSearchParams({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(filter ? { filter } : {}),
    ...(campaignId ? { campaign: campaignId } : {}),
    ...(emailSearch ? { email: emailSearch } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  }).toString();

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* ── Top header bar ── */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 shadow-xl">
        <div className="mx-auto px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-2.5">
                <Zap className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Benwill Outreach</h1>
                <p className="text-indigo-300 text-xs mt-0.5 font-medium">Outreach automation dashboard</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <AddLeadDialog campaigns={campaigns} />
              <ImportLeadsDialog campaigns={campaigns} />
              <Link
                href="/dashboard/campaigns"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <Settings className="w-3.5 h-3.5" />
                Campaigns
              </Link>
              <a
                href="/api/download-extension"
                download="benwill-outreach-extension.zip"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <Download className="w-3.5 h-3.5" />
                Extension
              </a>
              <a
                href={`/api/export-leads${exportParams ? `?${exportParams}` : ""}`}
                download
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export CSV
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page body ── */}
      <main className="mx-auto px-6 py-6 max-w-[1600px]">

        {/* Stats row */}
        <StatsCards
          totalLeads={totalLeads}
          sentLeads={sentLeads}
          repliedLeads={repliedLeads}
          pendingLeads={pendingLeads}
          bouncedLeads={bouncedLeads}
          scheduledLeads={scheduledLeads}
          followupDueCount={followupDueCount}
        />

        {/* Daily send tracker */}
        <DailySendTracker accountStats={dailyAccountStats} />

        {/* Main content card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">

          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50">
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-800">Leads</span>
              <span className="text-xs text-gray-400 font-normal">
                — showing up to {PAGE_SIZE} results
              </span>
            </div>
          </div>

          {/* Filters */}
          <AdvancedFilters
            campaigns={campaigns}
            currentStatus={status}
            currentFilter={filter}
            currentCampaignId={campaignId}
            currentEmail={emailSearch}
            currentDateFrom={dateFrom}
            currentDateTo={dateTo}
          />

          {/* Automation panels */}
          <div className="px-4 pb-2 pt-1 border-b border-gray-100 space-y-2">
            <BulkAutomationPanel currentCampaignId={campaignId} />
            <BulkSchedulePanel currentCampaignId={campaignId} />
            <BulkActionsRow currentCampaignId={campaignId} />
          </div>

          {/* Table */}
          <LeadsTableClient leads={leads} campaigns={campaigns} />
        </div>
      </main>
    </div>
  );
}
