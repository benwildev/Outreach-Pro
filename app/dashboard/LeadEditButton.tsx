"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditLeadDialog } from "./EditLeadDialog";
import { Pencil } from "lucide-react";

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
};

export function LeadEditButton({
  lead,
  campaigns,
}: {
  lead: Lead;
  campaigns: Campaign[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        data-action="edit"
        onClick={() => setOpen(true)}
        aria-label="Edit lead"
        title="Edit lead"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <EditLeadDialog
        lead={lead}
        campaigns={campaigns}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
