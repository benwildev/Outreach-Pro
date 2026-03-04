import Link from "next/link";
import { prisma } from "@/lib/prisma";
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
import { DeleteCampaignButton } from "./DeleteCampaignButton";

export const dynamic = "force-dynamic";

type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findMany>>[number] & {
  chatGptChatId?: string | null;
  gmailAuthUser?: string | null;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

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

  return (
    <main className="container mx-auto max-w-5xl py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/campaigns/new">New Campaign</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">← Back to Leads</Link>
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLeads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Replied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{repliedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Chat ID</TableHead>
                  <TableHead>Gmail Auth</TableHead>
                  <TableHead>Total Leads</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No campaigns yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {subjectPreview(c.subject)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs font-mono text-muted-foreground">
                        {c.chatGptChatId || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {c.gmailAuthUser || "0"}
                      </TableCell>
                      <TableCell>{c._count.leads}</TableCell>
                      <TableCell>{formatDate(c.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/campaigns/${c.id}`}>Edit</Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard?campaign=${c.id}`}>
                              View Leads
                            </Link>
                          </Button>
                          <DeleteCampaignButton campaignId={c.id} campaignName={c.name} />
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
