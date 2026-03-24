import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AddLeadDialog } from "./AddLeadDialog";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { LeadSendButton } from "./LeadSendButton";
import { LeadFollowupButton } from "./LeadFollowupButton";
import { LeadCheckReplyButton } from "./LeadCheckReplyButton";
import { LeadEditButton } from "./LeadEditButton";
import { LeadDeleteButton } from "./LeadDeleteButton";
import { LeadMessagePreviewButton } from "./LeadMessagePreviewButton";
import { ClientDate } from "./ClientDate";
import { Badge } from "@/components/ui/badge";
import { StatsCards } from "./StatsCards";
import { BulkAutomationPanel } from "./BulkAutomationPanel";
import { BulkSchedulePanel } from "./BulkSchedulePanel";
import { BulkActionsRow } from "./BulkActionsRow";
import { LeadsTableClient } from "./LeadsTableClient";
import { AdvancedFilters } from "./AdvancedFilters";
import { Settings } from "lucide-react";

const VALID_STATUSES = ["pending", "sent", "replied"] as const;
const PAGE_SIZE = 50;

type LeadRow = Prisma.LeadGetPayload<{
  include: { campaign: true };
}> & {
  sentGmailAuthUser?: string | null;
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function isFollowUpDue(lead: {
  status: string;
  step: number;
  nextFollowup: Date | null;
  campaign: { followup1: string | null; followup2: string | null };
}): boolean {
  const now = new Date();
  return (
    lead.status === "sent" &&
    lead.step < 3 &&
    lead.nextFollowup != null &&
    lead.nextFollowup <= now &&
    ((lead.step === 1 && (lead.campaign.followup1 ?? "").trim() !== "") ||
      (lead.step === 2 && (lead.campaign.followup2 ?? "").trim() !== ""))
  );
}

function getStepLabel(lead: { status: string; step: number; replied?: boolean }): string {
  if (lead.replied || lead.status === "replied") return "Replied";
  if (lead.status === "pending") return "Pending";
  if (lead.step === 1) return "Sent";
  if (lead.step === 2) return "Follow up 1";
  if (lead.step === 3) return "Follow up 2";
  return "Sent";
}

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
    where.email = { contains: emailSearch, mode: "insensitive" };
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
    include: {
      campaign: true,
    },
  })) as LeadRow[];

  // Get all leads for stats (no pagination)
  const [totalLeads, sentLeads, repliedLeads, pendingLeads, bouncedLeads] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "sent" } }),
    prisma.lead.count({ where: { status: "replied" } }),
    prisma.lead.count({ where: { status: "pending" } }),
    prisma.lead.count({ where: { status: "bounced" } }),
  ]);

  // Count follow-ups due
  const followupDueLeads = await prisma.lead.findMany({
    where: { status: "sent", nextFollowup: { lte: new Date() } },
  });
  const followupDueCount = followupDueLeads.length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-6 px-3">
      <div className="mx-auto w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Leads Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage and track your outreach campaigns</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AddLeadDialog campaigns={campaigns} />
              <ImportLeadsDialog campaigns={campaigns} />
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link href="/dashboard/campaigns">
                  <Settings className="w-4 h-4" />
                  Manage Campaigns
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          totalLeads={totalLeads}
          sentLeads={sentLeads}
          repliedLeads={repliedLeads}
          pendingLeads={pendingLeads}
          bouncedLeads={bouncedLeads}
          followupDueCount={followupDueCount}
        />

        {/* Main Content Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50 pb-3">
            <CardTitle className="text-xl">Leads List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AdvancedFilters
              campaigns={campaigns}
              currentStatus={status}
              currentFilter={filter}
              currentCampaignId={campaignId}
              currentEmail={emailSearch}
              currentDateFrom={dateFrom}
              currentDateTo={dateTo}
            />
            <BulkAutomationPanel currentCampaignId={campaignId} />
            <BulkSchedulePanel currentCampaignId={campaignId} />
            <BulkActionsRow currentCampaignId={campaignId} />
            <LeadsTableClient leads={leads} campaigns={campaigns} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
