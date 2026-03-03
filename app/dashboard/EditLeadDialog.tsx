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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} ref={formRef} className="space-y-4">
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
            <Label htmlFor="edit-recipientName">Recipient Name (required)</Label>
            <Input
              id="edit-recipientName"
              name="recipientName"
              placeholder="John Doe"
              required
              defaultValue={lead.recipientName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-recipientEmail">Recipient Email (required)</Label>
            <Input
              id="edit-recipientEmail"
              name="recipientEmail"
              type="email"
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
              type="url"
              placeholder="https://example.com"
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
