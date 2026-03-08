"use client";

import { useState } from "react";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientDate } from "./ClientDate";
import { LeadSendButton } from "./LeadSendButton";
import { LeadFollowupButton } from "./LeadFollowupButton";
import { LeadCheckReplyButton } from "./LeadCheckReplyButton";
import { LeadEditButton } from "./LeadEditButton";
import { LeadDeleteButton } from "./LeadDeleteButton";
import { LeadMessagePreviewButton } from "./LeadMessagePreviewButton";
import { bulkTriggerFollowup } from "./actions";
import { CheckSquare, Square } from "lucide-react";

type LeadRow = Prisma.LeadGetPayload<{
    include: { campaign: true };
}> & {
    sentGmailAuthUser?: string | null;
};

function getStepLabel(lead: { status: string; step: number; replied?: boolean }): string {
    if (lead.replied || lead.status === "replied") return "Replied";
    if (lead.status === "pending") return "Pending";
    if (lead.step === 1) return "Sent";
    if (lead.step === 2) return "Follow up 1";
    if (lead.step === 3) return "Follow up 2";
    return "Sent";
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

// Function to check if a specific lead is eligible for manual bulk follow-up
function canFollowUp(lead: { status: string; step: number; replied?: boolean }): boolean {
    if (lead.replied || lead.status === "replied") return false;
    if (lead.step >= 3) return false;
    return true;
}

interface LeadsTableClientProps {
    leads: LeadRow[];
    campaigns: { id: string; name: string }[];
}

export function LeadsTableClient({ leads, campaigns }: LeadsTableClientProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeploying, setIsDeploying] = useState(false);

    const toggleAll = () => {
        if (selectedIds.size === leads.length && leads.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(leads.map((l) => l.id)));
        }
    };

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleBulkFollowup = async () => {
        if (selectedIds.size === 0) return;
        setIsDeploying(true);
        try {
            // Send the set to array
            await bulkTriggerFollowup(Array.from(selectedIds));
            // Once complete, clear selection
            setSelectedIds(new Set());
        } catch (e) {
            console.error(e);
            alert("Failed to schedule bulk follow-up.");
        } finally {
            setIsDeploying(false);
        }
    };

    // Compute what actions we can do. Count how many are eligible for follow up.
    const selectedList = leads.filter(l => selectedIds.has(l.id));
    const followUpEligibleCount = selectedList.filter(l => canFollowUp({ status: l.status, step: l.step, replied: l.replied })).length;

    return (
        <div>
            {/* Floating Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-blue-200 shadow-xl rounded-full px-6 py-3 flex items-center gap-4 transition-all duration-300 transform scale-100">
                    <div className="text-sm font-medium text-slate-700 whitespace-nowrap">
                        {selectedIds.size} row{selectedIds.size > 1 ? "s" : ""} selected
                    </div>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <Button
                        disabled={followUpEligibleCount === 0 || isDeploying}
                        onClick={handleBulkFollowup}
                        variant="default"
                        size="sm"
                        className="rounded-full shadow-sm text-xs h-8 px-4"
                    >
                        {isDeploying ? "Updating..." : `Follow-up Now (${followUpEligibleCount})`}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                        onClick={() => setSelectedIds(new Set())}
                    >
                        &times;
                    </Button>
                </div>
            )}

            <div className="overflow-x-auto">
                <Table className="w-full table-fixed text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-2 min-w-[1100px]">
                    <TableHeader>
                        <TableRow className="border-b border-gray-200 bg-gray-50 hover:bg-gray-50">
                            <TableHead className="w-[3%] text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                                    checked={leads.length > 0 && selectedIds.size === leads.length}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = selectedIds.size > 0 && selectedIds.size < leads.length;
                                        }
                                    }}
                                    onChange={toggleAll}
                                />
                            </TableHead>
                            <TableHead className="w-[7%] font-semibold text-gray-700">Campaign</TableHead>
                            <TableHead className="w-[8%] font-semibold text-gray-700">Recipient</TableHead>
                            <TableHead className="w-[14%] font-semibold text-gray-700">Email</TableHead>
                            <TableHead className="w-[10%] font-semibold text-gray-700">Website</TableHead>
                            <TableHead className="w-[10%] font-semibold text-gray-700">Niche</TableHead>
                            <TableHead className="w-[6%] font-semibold text-gray-700">Status</TableHead>
                            <TableHead className="w-[6%] font-semibold text-gray-700">Thread ID</TableHead>
                            <TableHead className="w-[5%] font-semibold text-gray-700">Mail</TableHead>
                            <TableHead className="w-[8%] font-semibold text-gray-700">Sent Gmail</TableHead>
                            <TableHead className="w-[8%] font-semibold text-gray-700">Sent At</TableHead>
                            <TableHead className="w-[8%] font-semibold text-gray-700">Created At</TableHead>
                            <TableHead className="w-[10%] font-semibold text-gray-700">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {leads.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={13}
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
                                    data-campaign-signature={lead.campaign.signature ?? ""}
                                    data-gmail-thread-id={lead.gmailThreadId ?? ""}
                                    className={`border-b border-gray-100 transition-colors duration-150 ${selectedIds.has(lead.id) ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50'}`}
                                    onClick={(e) => {
                                        // Ignore clicks on buttons/links
                                        if (e.target instanceof HTMLElement && (e.target.closest('button') || e.target.closest('a'))) {
                                            return;
                                        }
                                        toggleOne(lead.id);
                                    }}
                                >
                                    <TableCell className="text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                                            checked={selectedIds.has(lead.id)}
                                            onChange={() => toggleOne(lead.id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium truncate" title={lead.campaign.name}>
                                        <Link
                                            href={`/dashboard/campaigns/${lead.campaign.id}`}
                                            className="text-primary underline-offset-4 hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {lead.campaign.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="font-medium truncate" title={lead.recipientName}>
                                        {lead.recipientName}
                                    </TableCell>
                                    <TableCell className="truncate" title={lead.recipientEmail}>{lead.recipientEmail}</TableCell>
                                    <TableCell className="truncate text-xs text-muted-foreground" title={lead.websiteUrl ?? undefined}>
                                        {lead.websiteUrl || "—"}
                                    </TableCell>
                                    <TableCell className="truncate text-xs" title={lead.niche ?? undefined}>
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
                                    <TableCell className="truncate text-xs font-mono" title={lead.gmailThreadId ?? undefined}>
                                        {lead.gmailThreadId ? (
                                            <a
                                                href={`https://mail.google.com/mail/u/${lead.sentGmailAuthUser || 0}/#all/${lead.gmailThreadId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {lead.gmailThreadId}
                                            </a>
                                        ) : (
                                            "—"
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center">
                                            <LeadMessagePreviewButton
                                                subject={lead.sentSubject}
                                                body={lead.sentBody}
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="truncate font-mono text-[11px]" title={lead.sentGmailAuthUser ?? undefined}>
                                        {lead.sentGmailAuthUser || "—"}
                                    </TableCell>
                                    <TableCell className="truncate text-xs"><ClientDate date={lead.sentAt} /></TableCell>
                                    <TableCell className="truncate text-xs"><ClientDate date={lead.createdAt} /></TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
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
            </div >
        </div >
    );
}
