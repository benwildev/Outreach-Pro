"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLead } from "./actions";

type Campaign = { id: string; name: string };

type Lead = {
  id: string;
  recipientName: string;
  recipientEmail: string;
  websiteUrl: string | null;
  niche: string | null;
  campaignId: string;
  status: string;
  step: number;
  replied: boolean;
  sentGmailAuthUser?: string | null;
  bouncedEmail?: string | null;
  gmailThreadId?: string | null;
  sentAt?: Date | string | null;
  nextFollowup?: Date | string | null;
  replyCategory?: string | null;
  unsubscribed?: boolean;
};

/** Format a Date (or ISO string) to the value expected by <input type="datetime-local"> */
function toDatetimeLocal(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditLeadDialog({
  lead,
  campaigns,
  open,
  onOpenChange,
}: {
  lead: Lead;
  campaigns: Campaign[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && formRef.current) {
      const f = formRef.current;
      (f.elements.namedItem("recipientName") as HTMLInputElement).value = lead.recipientName;
      (f.elements.namedItem("recipientEmail") as HTMLInputElement).value = lead.recipientEmail;
      (f.elements.namedItem("campaignId") as HTMLSelectElement).value = lead.campaignId;
      (f.elements.namedItem("websiteUrl") as HTMLInputElement).value = lead.websiteUrl ?? "";
      (f.elements.namedItem("niche") as HTMLInputElement).value = lead.niche ?? "";
      (f.elements.namedItem("status") as HTMLSelectElement).value = lead.status;
      (f.elements.namedItem("step") as HTMLInputElement).value = String(lead.step);
      (f.elements.namedItem("replied") as HTMLInputElement).checked = lead.replied;
      (f.elements.namedItem("unsubscribed") as HTMLInputElement).checked = !!lead.unsubscribed;
      (f.elements.namedItem("sentGmailAuthUser") as HTMLInputElement).value = lead.sentGmailAuthUser ?? "";
      (f.elements.namedItem("gmailThreadId") as HTMLInputElement).value = lead.gmailThreadId ?? "";
      (f.elements.namedItem("sentAt") as HTMLInputElement).value = toDatetimeLocal(lead.sentAt);
      (f.elements.namedItem("nextFollowup") as HTMLInputElement).value = toDatetimeLocal(lead.nextFollowup);
      (f.elements.namedItem("replyCategory") as HTMLSelectElement).value = lead.replyCategory ?? "";
    }
  }, [open, lead]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      await updateLead(lead.id, formData);
      onOpenChange(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Lead</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} ref={formRef} className="space-y-4 overflow-y-auto pr-1">

          {/* Campaign */}
          <div className="space-y-2">
            <Label htmlFor="edit-campaignId">Campaign (required)</Label>
            <select
              id="edit-campaignId"
              name="campaignId"
              required
              defaultValue={lead.campaignId}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Name + Email */}
          <div className="space-y-2">
            <Label htmlFor="edit-recipientName">Recipient Name (optional)</Label>
            <Input
              id="edit-recipientName"
              name="recipientName"
              placeholder="John Doe"
              defaultValue={lead.recipientName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-recipientEmail">Recipient Email (required)</Label>
            <Input
              id="edit-recipientEmail"
              name="recipientEmail"
              type="email"
              multiple
              placeholder="john@example.com"
              required
              defaultValue={lead.recipientEmail}
            />
          </div>

          {/* Website + Niche */}
          <div className="space-y-2">
            <Label htmlFor="edit-websiteUrl">Website URL (optional)</Label>
            <Input
              id="edit-websiteUrl"
              name="websiteUrl"
              type="text"
              placeholder="example.com"
              defaultValue={lead.websiteUrl ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-niche">Niche (optional)</Label>
            <Input
              id="edit-niche"
              name="niche"
              placeholder="e.g. marketing, SaaS, real estate"
              defaultValue={lead.niche ?? ""}
            />
          </div>

          {/* Sent Gmail Account */}
          <div className="space-y-2">
            <Label htmlFor="edit-sentGmailAuthUser">Sent from Gmail Account</Label>
            <Input
              id="edit-sentGmailAuthUser"
              name="sentGmailAuthUser"
              type="email"
              placeholder="sender@gmail.com"
              defaultValue={lead.sentGmailAuthUser ?? ""}
            />
          </div>

          {/* Gmail Thread ID */}
          <div className="space-y-2">
            <Label htmlFor="edit-gmailThreadId">Gmail Thread ID</Label>
            <Input
              id="edit-gmailThreadId"
              name="gmailThreadId"
              placeholder="1234abcd5678ef90"
              defaultValue={lead.gmailThreadId ?? ""}
              className="font-mono text-xs"
            />
          </div>

          {/* Bounced address (read-only, only when bounced) */}
          {lead.status === "bounced" && lead.bouncedEmail && (
            <div className="space-y-2">
              <Label className="text-xs text-orange-600 font-semibold">Bounced Address</Label>
              <p className="text-sm font-mono bg-orange-50 border border-orange-200 rounded-md px-3 py-2 text-orange-700 select-all">
                {lead.bouncedEmail}
              </p>
            </div>
          )}

          {/* Status + Step */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                name="status"
                defaultValue={lead.status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="scheduled">Scheduled</option>
                <option value="replied">Replied</option>
                <option value="bounced">Bounced</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-step">Step (1-3)</Label>
              <Input
                id="edit-step"
                name="step"
                type="number"
                min="1"
                max="3"
                defaultValue={lead.step}
              />
            </div>
          </div>

          {/* Reply Category */}
          <div className="space-y-2">
            <Label htmlFor="edit-replyCategory">Reply Category</Label>
            <select
              id="edit-replyCategory"
              name="replyCategory"
              defaultValue={lead.replyCategory ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">— none —</option>
              <option value="positive">Positive</option>
              <option value="ooo">Out of Office</option>
              <option value="negative">Negative</option>
              <option value="unsubscribe">Unsubscribe</option>
            </select>
          </div>

          {/* Sent At + Next Followup */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-sentAt">Sent At</Label>
              <Input
                id="edit-sentAt"
                name="sentAt"
                type="datetime-local"
                defaultValue={toDatetimeLocal(lead.sentAt)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-nextFollowup">Next Followup</Label>
              <Input
                id="edit-nextFollowup"
                name="nextFollowup"
                type="datetime-local"
                defaultValue={toDatetimeLocal(lead.nextFollowup)}
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <input
                id="edit-replied"
                name="replied"
                type="checkbox"
                value="true"
                defaultChecked={lead.replied}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="edit-replied">Mark as Replied</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit-unsubscribed"
                name="unsubscribed"
                type="checkbox"
                value="true"
                defaultChecked={!!lead.unsubscribed}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <Label htmlFor="edit-unsubscribed">Unsubscribed</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
