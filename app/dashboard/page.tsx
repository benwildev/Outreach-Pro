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
import { DashboardTabs } from "./DashboardTabs";
import { Badge } from "@/components/ui/badge";
import { CampaignFilter } from "./CampaignFilter";
import { StatsCards } from "./StatsCards";
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
  searchParams: { status?: string; filter?: string; campaign?: string };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const statusFilter = searchParams.status?.toLowerCase();
  const status =
    statusFilter && VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number])
      ? statusFilter
      : null;
  const filter = searchParams.filter ?? null;
  const campaignId = searchParams.campaign ?? null;

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

  const leads = (await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: {
      campaign: true,
    },
  })) as LeadRow[];

  // Get all leads for stats (no pagination)
  const totalLeads = await prisma.lead.count();
  const sentLeads = await prisma.lead.count({ where: { status: "sent" } });
  const repliedLeads = await prisma.lead.count({ where: { status: "replied" } });
  const pendingLeads = await prisma.lead.count({ where: { status: "pending" } });
  
  // Count follow-ups due
  const followupDueLeads = await prisma.lead.findMany({
    where: { status: "sent", nextFollowup: { lte: new Date() } },
  });
  const followupDueCount = followupDueLeads.length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4">
      <div className="container mx-auto max-w-7xl">
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
          followupDueCount={followupDueCount}
        />

        {/* Main Content Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-xl">Leads List</CardTitle>
              <div className="flex flex-col md:flex-row gap-3">
                <DashboardTabs currentStatus={status} filter={filter} />
                <CampaignFilter campaigns={campaigns} currentCampaignId={campaignId} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="w-full table-fixed text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-2">
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50 hover:bg-gray-50">
                  <TableHead className="w-[9%] font-semibold leading-tight text-gray-700">Campaign</TableHead>
                  <TableHead className="w-[10%] font-semibold leading-tight text-gray-700">Recipient Name</TableHead>
                  <TableHead className="w-[13%] font-semibold leading-tight text-gray-700">Recipient Email</TableHead>
                  <TableHead className="w-[7%] font-semibold leading-tight text-gray-700">Website</TableHead>
                  <TableHead className="w-[6%] font-semibold leading-tight text-gray-700">Niche</TableHead>
                  <TableHead className="w-[8%] font-semibold leading-tight text-gray-700">Status</TableHead>
                  <TableHead className="w-[9%] font-semibold leading-tight text-gray-700">Thread ID</TableHead>
                  <TableHead className="w-[6%] font-semibold leading-tight text-gray-700">Mail Data</TableHead>
                  <TableHead className="w-[10%] font-semibold leading-tight text-gray-700">Sent Gmail</TableHead>
                  <TableHead className="w-[7%] font-semibold leading-tight text-gray-700">Sent At</TableHead>
                  <TableHead className="w-[7%] font-semibold leading-tight text-gray-700">Created At</TableHead>
                  <TableHead className="w-[8%] font-semibold leading-tight text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No leads found.
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      data-lead-id={lead.id}
                      data-campaign-id={lead.campaign.id}
                      data-campaign-chat-id={lead.campaign.chatGptChatId ?? ""}
                      data-campaign-gmail-auth-user={lead.campaign.gmailAuthUser ?? ""}
                      data-campaign-body={lead.campaign.body ?? ""}
                      data-campaign-subject={lead.campaign.subject ?? ""}
                      data-followup1={lead.campaign.followup1 ?? ""}
                      data-followup2={lead.campaign.followup2 ?? ""}
                      data-gmail-thread-id={lead.gmailThreadId ?? ""}
                      className="border-b border-gray-100 hover:bg-blue-50 transition-colors duration-150"
                    >
                      <TableCell className="font-medium break-words">
                        <Link
                          href={`/dashboard/campaigns/${lead.campaign.id}`}
                          className="text-primary underline-offset-4 hover:underline break-words"
                        >
                          {lead.campaign.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium break-words">
                        {lead.recipientName}
                      </TableCell>
                      <TableCell className="break-all">{lead.recipientEmail}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground" title={lead.websiteUrl ?? undefined}>
                        {lead.websiteUrl || "—"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate text-xs">
                        {lead.niche || "—"}
                      </TableCell>
                      <TableCell data-step={lead.step}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant={
                              lead.replied || lead.status === "replied"
                                ? "replied"
                                : lead.status === "pending"
                                  ? "pending"
                                  : "sent"
                            }
                            className="text-[10px] capitalize"
                          >
                            {getStepLabel(lead)}
                          </Badge>
                          {isFollowUpDue(lead) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Due
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs font-mono" title={lead.gmailThreadId ?? undefined}>
                        {lead.gmailThreadId ? `${lead.gmailThreadId.substring(0, 12)}...` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <LeadMessagePreviewButton
                            subject={lead.sentSubject}
                            body={lead.sentBody}
                          />
                        </div>
                      </TableCell>
                      <TableCell
                        className="max-w-[140px] truncate whitespace-nowrap font-mono text-[11px]"
                        title={lead.sentGmailAuthUser ?? undefined}
                      >
                        {lead.sentGmailAuthUser || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(lead.sentAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(lead.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <LeadSendButton leadId={lead.id} status={lead.status} />
                          <LeadFollowupButton
                            leadId={lead.id}
                            status={lead.status}
                            step={lead.step}
                            nextFollowup={lead.nextFollowup}
                            followup1={lead.campaign.followup1}
                            followup2={lead.campaign.followup2}
                          />
                          <LeadCheckReplyButton
                            leadId={lead.id}
                            status={lead.status}
                            threadId={lead.gmailThreadId}
                            recipientEmail={lead.recipientEmail}
                          />
                          <LeadEditButton
                            lead={{
                              id: lead.id,
                              recipientName: lead.recipientName,
                              recipientEmail: lead.recipientEmail,
                              websiteUrl: lead.websiteUrl,
                              niche: lead.niche,
                              campaignId: lead.campaign.id,
                            }}
                            campaigns={campaigns}
                          />
                          <LeadDeleteButton leadId={lead.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
