"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditLeadDialog } from "./EditLeadDialog";

type Campaign = { id: string; name: string };

type Lead = {
  id: string;
  recipientName: string;
  recipientEmail: string;
  websiteUrl: string | null;
  niche: string | null;
  campaignId: string;
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
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
