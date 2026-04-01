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
import { ShieldCheck, Download, FileDown, BarChart2, Zap, LayoutDashboard, Settings } from "lucide-react";
import { promoteScheduledLeads } from "@/lib/promoteScheduledLeads";
import Image from "next/image";

const VALID_STATUSES = ["pending", "sent", "scheduled", "failed", "replied", "bounced"] as const;
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
    page?: string;
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await promoteScheduledLeads();

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
  const currentPage = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const campaigns = await prisma.campaign.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isFollowUpDueFilter = filter === "followup-due";
  const baseWhere: Prisma.LeadWhereInput = {};

  if (campaignId) baseWhere.campaignId = campaignId;

  if (dateFrom || dateTo) {
    const sentAtFilter: Prisma.DateTimeNullableFilter = {};
    if (dateFrom) sentAtFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) sentAtFilter.lte = new Date(dateTo + "T23:59:59");
    baseWhere.sentAt = sentAtFilter;
  }

  const where: Prisma.LeadWhereInput = { ...baseWhere };

  if (isFollowUpDueFilter) {
    where.status = "sent";
    where.nextFollowup = { lte: new Date() };
  } else if (status) {
    where.status = status;
  }

  if (emailSearch) {
    where.recipientEmail = { contains: emailSearch, mode: "insensitive" };
  }

  const skip = (currentPage - 1) * PAGE_SIZE;

  const [leads, filteredTotal] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
      take: PAGE_SIZE,
      skip,
      include: { campaign: true },
    }) as Promise<LeadRow[]>,
    prisma.lead.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  const [totalLeads, sentLeads, repliedLeads, pendingLeads, bouncedLeads, scheduledLeads, failedLeads] = await Promise.all([
    prisma.lead.count({ where: baseWhere }),
    prisma.lead.count({ where: { ...baseWhere, status: "sent" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "replied" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "pending" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "bounced" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "scheduled" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "failed" } }),
  ]);

  const followupDueLeads = await prisma.lead.findMany({
    where: { ...baseWhere, status: "sent", nextFollowup: { lte: new Date() } },
    select: { step: true }
  });
  const followupDueCount1 = followupDueLeads.filter(l => l.step === 1).length;
  const followupDueCount2 = followupDueLeads.filter(l => l.step === 2).length;

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

  function buildPageUrl(page: number) {
    const params = new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(filter ? { filter } : {}),
      ...(campaignId ? { campaign: campaignId } : {}),
      ...(emailSearch ? { email: emailSearch } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(page > 1 ? { page: String(page) } : {}),
    });
    const qs = params.toString();
    return `/dashboard${qs ? `?${qs}` : ""}`;
  }

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
              <Image src="/logo.png" alt="Benwill Outreach" width={40} height={40} className="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5" />
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
              <Link
                href="/analytics"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Analytics
              </Link>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Security
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
          failedLeads={failedLeads}
          followupDueCount1={followupDueCount1}
          followupDueCount2={followupDueCount2}
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
                — showing {skip + 1}–{Math.min(skip + leads.length, filteredTotal)} of {filteredTotal.toLocaleString()}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/60">
              <span className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={buildPageUrl(currentPage - 1)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-all duration-150"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-300 border border-gray-200 bg-white rounded-lg px-3 py-1.5 cursor-not-allowed">
                    ← Previous
                  </span>
                )}
                {currentPage < totalPages ? (
                  <Link
                    href={buildPageUrl(currentPage + 1)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-all duration-150"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-300 border border-gray-200 bg-white rounded-lg px-3 py-1.5 cursor-not-allowed">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
