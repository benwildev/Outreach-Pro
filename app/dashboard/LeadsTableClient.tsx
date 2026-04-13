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
import { LeadScheduleButton } from "./LeadScheduleButton";
import { LeadFollowupButton } from "./LeadFollowupButton";
import { LeadCheckReplyButton } from "./LeadCheckReplyButton";
import { LeadEditButton } from "./LeadEditButton";
import { LeadDeleteButton } from "./LeadDeleteButton";
import { LeadMessagePreviewButton } from "./LeadMessagePreviewButton";
import { bulkTriggerFollowup, bulkDeleteLeads } from "./actions";
import { CheckSquare, Square, Trash2 } from "lucide-react";

type LeadRow = Prisma.LeadGetPayload<{
    include: { campaign: true };
}> & {
    sentGmailAuthUser?: string | null;
    bouncedEmail?: string | null;
};

function getStepLabel(lead: { status: string; step: number; replied?: boolean }): string {
    if (lead.replied || lead.status === "replied") return "Replied";
    if (lead.status === "bounced") return "Bounced";
    if (lead.status === "pending") return "Pending";
    if (lead.status === "failed") return "Failed";
    if (lead.status === "scheduled") {
        if (lead.step === 2) return "FU1 Scheduled";
        if (lead.step === 3) return "FU2 Scheduled";
        return "Scheduled";
    }
    if (lead.step === 1) return "Sent";
    if (lead.step === 2) return "Follow up 1";
    if (lead.step === 3) return "Follow up 2";
    return "Sent";
}

function isFollowUpDue(lead: {
    status: string;
    step: number;
    nextFollowup: Date | null;
    campaign?: { followup1: string | null; followup2: string | null };
}): boolean {
    const now = new Date();
    return (
        lead.status === "sent" &&
        lead.step < 3 &&
        lead.nextFollowup != null &&
        new Date(lead.nextFollowup) <= now
    );
}

type ReplyCategory = "Interested" | "Not Interested" | "Out of Office" | "Unsubscribe" | "Bounced" | "Other";

function categorizeReply(body: string | null | undefined): ReplyCategory {
    if (!body) return "Other";
    const lower = body.toLowerCase();

    const interested = [
        "interested", "sounds good", "tell me more", "let's talk", "lets talk",
        "love to chat", "would love", "set up a call", "schedule a call",
        "send me more", "please send", "can we connect", "happy to hop",
        "open to", "i'd like", "id like", "yes please", "absolutely",
        "definitely interested", "looks good", "can you share",
    ];
    const notInterested = [
        "not interested", "no thanks", "no thank you", "don't contact",
        "do not contact", "remove me", "take me off", "stop emailing",
        "not a good fit", "not for us", "pass", "decline", "rejected",
        "don't reach out", "please don't", "not right now", "maybe another time",
    ];
    const ooo = [
        "out of office", "i'm away", "im away", "on vacation", "on leave",
        "annual leave", "i will be back", "i'll be back", "ill be back",
        "away until", "returning on", "currently unavailable", "auto-reply",
        "automatic reply", "i am currently out",
    ];
    const unsub = [
        "unsubscribe", "opt out", "opt-out", "remove from", "please remove",
        "stop sending", "no longer wish", "don't want", "don't send",
        "mailing list", "email list",
    ];
    const bounced = [
        "delivery failed", "delivery status notification", "undeliverable",
        "address not found", "does not exist", "mailbox full",
        "user unknown", "no such user", "invalid address",
        "permanent failure", "could not be delivered",
    ];

    if (bounced.some((k) => lower.includes(k))) return "Bounced";
    if (unsub.some((k) => lower.includes(k))) return "Unsubscribe";
    if (notInterested.some((k) => lower.includes(k))) return "Not Interested";
    if (ooo.some((k) => lower.includes(k))) return "Out of Office";
    if (interested.some((k) => lower.includes(k))) return "Interested";
    return "Other";
}

const replyCategoryStyles: Record<ReplyCategory, string> = {
    "Interested":     "bg-emerald-100 text-emerald-800 border-emerald-200",
    "Not Interested": "bg-red-100 text-red-800 border-red-200",
    "Out of Office":  "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Unsubscribe":    "bg-orange-100 text-orange-800 border-orange-200",
    "Bounced":        "bg-purple-100 text-purple-800 border-purple-200",
    "Other":          "bg-gray-100 text-gray-600 border-gray-200",
};

function ReplyBadge({ body }: { body: string | null | undefined }) {
    const cat = categorizeReply(body);
    return (
        <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border ${replyCategoryStyles[cat]}`}>
            {cat}
        </span>
    );
}

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

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected lead(s)? This cannot be undone.`)) return;
        setIsDeploying(true);
        try {
            await bulkDeleteLeads(Array.from(selectedIds));
            setSelectedIds(new Set());
        } catch (e) {
            console.error(e);
            alert("Failed to delete leads.");
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
                        disabled={isDeploying}
                        onClick={handleBulkDelete}
                        variant="destructive"
                        size="sm"
                        className="rounded-full shadow-sm text-xs h-8 px-4 flex items-center gap-1.5"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete ({selectedIds.size})
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
                <Table className="w-full table-fixed text-xs [&_th]:px-2.5 [&_th]:py-3 [&_td]:px-2.5 [&_td]:py-2.5 min-w-[1100px]">
                    <TableHeader>
                        <TableRow className="border-b-2 border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 hover:bg-transparent">
                            <TableHead className="w-[3%] text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                                    checked={leads.length > 0 && selectedIds.size === leads.length}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = selectedIds.size > 0 && selectedIds.size < leads.length;
                                        }
                                    }}
                                    onChange={toggleAll}
                                />
                            </TableHead>
                            <TableHead className="w-[7%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Campaign</TableHead>
                            <TableHead className="w-[8%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Recipient</TableHead>
                            <TableHead className="w-[14%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Email</TableHead>
                            <TableHead className="w-[10%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Website</TableHead>
                            <TableHead className="w-[10%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Niche</TableHead>
                            <TableHead className="w-[6%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Status</TableHead>
                            <TableHead className="w-[6%] text-[11px] font-bold text-gray-600 uppercase tracking-wide" title="Gmail thread ID — captured after send">Thread ID</TableHead>
                            <TableHead className="w-[5%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Mail</TableHead>
                            <TableHead className="w-[8%] text-[11px] font-bold text-gray-600 uppercase tracking-wide" title="Gmail account used to send this email">Gmail Acct</TableHead>
                            <TableHead className="w-[8%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Sent At</TableHead>
                            <TableHead className="w-[8%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Next Followup</TableHead>
                            <TableHead className="w-[10%] text-[11px] font-bold text-gray-600 uppercase tracking-wide">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {leads.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={13}
                                    className="h-32 text-center text-gray-400 text-sm"
                                >
                                    <div className="flex flex-col items-center gap-2 py-8">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                            <span className="text-lg">📭</span>
                                        </div>
                                        <span>No leads found</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            leads.map((lead, idx) => (
                                <TableRow
                                    key={lead.id}
                                    data-lead-id={lead.id}
                                    data-campaign-id={lead.campaign.id}
                                    data-campaign-chat-id={lead.campaign.chatGptChatId ?? ""}
                                    data-campaign-gmail-auth-user={lead.campaign.gmailAuthUser ?? ""}
                                    data-campaign-gmail-account-index={lead.campaign.gmailAccountIndex != null ? String(lead.campaign.gmailAccountIndex) : ""}
                                    data-campaign-body={lead.campaign.body ?? ""}
                                    data-campaign-subject={lead.campaign.subject ?? ""}
                                    data-followup1={lead.campaign.followup1 ?? ""}
                                    data-followup2={lead.campaign.followup2 ?? ""}
                                    data-campaign-signature={lead.campaign.signature ?? ""}
                                    data-gmail-thread-id={lead.gmailThreadId ?? ""}
                                    data-sent-gmail-auth-user={lead.sentGmailAuthUser ?? ""}
                                    className={`border-b border-gray-100 transition-colors duration-150 cursor-pointer ${
                                        selectedIds.has(lead.id)
                                            ? 'bg-indigo-50 hover:bg-indigo-50/80'
                                            : idx % 2 === 0
                                            ? 'bg-white hover:bg-slate-50'
                                            : 'bg-gray-50/50 hover:bg-slate-50'
                                    }`}
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
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Badge
                                                    variant={
                                                        lead.replied || lead.status === "replied"
                                                            ? "replied"
                                                            : lead.status === "bounced"
                                                                ? "bounced"
                                                                : lead.status === "failed"
                                                                    ? "failed"
                                                                    : lead.status === "scheduled"
                                                                        ? "scheduled"
                                                                        : lead.status === "pending"
                                                                            ? "pending"
                                                                            : "sent"
                                                    }
                                                    className="text-[10px] capitalize"
                                                    title={lead.status === "bounced" && lead.bouncedEmail ? `Bounced: ${lead.bouncedEmail}` : undefined}
                                                >
                                                    {getStepLabel(lead)}
                                                </Badge>
                                                {isFollowUpDue(lead) && (
                                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                                        Due
                                                    </Badge>
                                                )}
                                                {lead.unsubscribed && (
                                                    <span className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                                                        Unsub
                                                    </span>
                                                )}
                                            </div>
                                            {lead.replyCategory ? (
                                                <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border ${
                                                    lead.replyCategory === "positive" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                                    lead.replyCategory === "ooo" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                                                    lead.replyCategory === "negative" ? "bg-red-100 text-red-800 border-red-200" :
                                                    lead.replyCategory === "unsubscribe" ? "bg-orange-100 text-orange-800 border-orange-200" :
                                                    "bg-gray-100 text-gray-600 border-gray-200"
                                                }`}>
                                                    {lead.replyCategory === "ooo" ? "Out of Office" :
                                                     lead.replyCategory === "positive" ? "Positive" :
                                                     lead.replyCategory === "negative" ? "Negative" :
                                                     lead.replyCategory === "unsubscribe" ? "Unsubscribe" :
                                                     lead.replyCategory}
                                                </span>
                                            ) : (lead.replied || lead.status === "replied") && (
                                                <ReplyBadge body={lead.replyBody} />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="truncate text-xs font-mono" title={lead.gmailThreadId ?? undefined}>
                                        {lead.gmailThreadId ? (() => {
                                            // Keep @ raw (not %40) and add trailing slash — both required for
                                            // Gmail to route email-format /u/email@gmail.com/ links correctly
                                            // without redirecting to u/0.
                                            const acct = lead.sentGmailAuthUser || "0";
                                            const isScheduled = lead.sentAt && new Date(lead.sentAt) > new Date();
                                            const folder = isScheduled ? "scheduled" : "all";
                                            const gmailUrl = `https://mail.google.com/mail/u/${acct}/#${folder}/${lead.gmailThreadId}`;
                                            return (
                                                <a
                                                    href={gmailUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {lead.gmailThreadId}
                                                </a>
                                            );
                                        })() : (
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
                                    <TableCell className="truncate font-mono text-[11px]" title={lead.sentGmailAuthUser ? `Gmail account: ${lead.sentGmailAuthUser}` : "Not captured"}>
                                        {lead.sentGmailAuthUser || "—"}
                                    </TableCell>
                                    <TableCell className="truncate text-xs"><ClientDate date={lead.sentAt} /></TableCell>
                                    <TableCell className="truncate text-xs">
                                        {lead.nextFollowup ? (
                                            <span className={new Date(lead.nextFollowup) <= new Date() && lead.status === "sent" ? "text-amber-600 font-medium" : ""}>
                                                <ClientDate date={lead.nextFollowup} />
                                            </span>
                                        ) : "—"}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <LeadSendButton leadId={lead.id} status={lead.status} />
                                            <LeadScheduleButton leadId={lead.id} status={lead.status} />
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
                                                    status: lead.status,
                                                    step: lead.step,
                                                    replied: lead.replied,
                                                    sentGmailAuthUser: lead.sentGmailAuthUser,
                                                    bouncedEmail: lead.bouncedEmail,
                                                    gmailThreadId: lead.gmailThreadId,
                                                    sentAt: lead.sentAt,
                                                    nextFollowup: lead.nextFollowup,
                                                    replyCategory: lead.replyCategory,
                                                    unsubscribed: lead.unsubscribed,
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
