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
import { LeadEditButton } from "./LeadEditButton";
import { LeadDeleteButton } from "./LeadDeleteButton";
import { DashboardTabs } from "./DashboardTabs";
import { Badge } from "@/components/ui/badge";
import { CampaignFilter } from "./CampaignFilter";

const VALID_STATUSES = ["pending", "sent", "replied"] as const;
const PAGE_SIZE = 50;

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

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: {
      campaign: { select: { id: true, name: true, subject: true, body: true, followup1: true, followup2: true } },
    },
  });

  return (
    <main className="container mx-auto max-w-6xl py-10">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Leads Dashboard</CardTitle>
          <div className="flex items-center gap-2">
            <AddLeadDialog campaigns={campaigns} />
            <ImportLeadsDialog campaigns={campaigns} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/campaigns">Manage Campaigns</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <DashboardTabs currentStatus={status} filter={filter} />
            <CampaignFilter campaigns={campaigns} currentCampaignId={campaignId} />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Recipient Name</TableHead>
                  <TableHead>Recipient Email</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Niche</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-[280px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No leads found.
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      data-campaign-body={lead.campaign.body ?? ""}
                      data-campaign-subject={lead.campaign.subject ?? ""}
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/campaigns/${lead.campaign.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {lead.campaign.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.recipientName}
                      </TableCell>
                      <TableCell>{lead.recipientEmail}</TableCell>
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
                      <TableCell>{formatDate(lead.sentAt)}</TableCell>
                      <TableCell>{formatDate(lead.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <LeadSendButton leadId={lead.id} status={lead.status} />
                          <LeadFollowupButton
                            leadId={lead.id}
                            status={lead.status}
                            step={lead.step}
                            nextFollowup={lead.nextFollowup}
                            followup1={lead.campaign.followup1}
                            followup2={lead.campaign.followup2}
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
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
