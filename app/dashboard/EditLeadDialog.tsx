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
};

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
      (formRef.current.elements.namedItem("recipientName") as HTMLInputElement).value = lead.recipientName;
      (formRef.current.elements.namedItem("recipientEmail") as HTMLInputElement).value = lead.recipientEmail;
      (formRef.current.elements.namedItem("campaignId") as HTMLSelectElement).value = lead.campaignId;
      (formRef.current.elements.namedItem("websiteUrl") as HTMLInputElement).value = lead.websiteUrl ?? "";
      (formRef.current.elements.namedItem("niche") as HTMLInputElement).value = lead.niche ?? "";
      (formRef.current.elements.namedItem("status") as HTMLSelectElement).value = lead.status;
      (formRef.current.elements.namedItem("step") as HTMLInputElement).value = String(lead.step);
      (formRef.current.elements.namedItem("replied") as HTMLInputElement).checked = lead.replied;
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

          {lead.sentGmailAuthUser && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Sent from Gmail Account</Label>
              <p className="text-sm font-mono bg-muted/50 rounded-md px-3 py-2 text-muted-foreground select-all">
                {lead.sentGmailAuthUser}
              </p>
            </div>
          )}

          {lead.status === "bounced" && lead.bouncedEmail && (
            <div className="space-y-2">
              <Label className="text-xs text-orange-600 font-semibold">Bounced Address</Label>
              <p className="text-sm font-mono bg-orange-50 border border-orange-200 rounded-md px-3 py-2 text-orange-700 select-all">
                {lead.bouncedEmail}
              </p>
            </div>
          )}

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
                <option value="replied">Replied</option>
                <option value="bounced">Bounced</option>
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

          <div className="flex items-center space-x-2">
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
