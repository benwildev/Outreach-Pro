"use client";

import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface LeadCheckReplyButtonProps {
  leadId: string;
  status: string;
  threadId: string | null;
  recipientEmail: string;
}

export function LeadCheckReplyButton({
  leadId,
  status,
  threadId,
  recipientEmail,
}: LeadCheckReplyButtonProps) {
  const canCheck = status === "sent" && !!threadId;

  if (!canCheck) {
    return null;
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="h-9 w-9"
      data-action="check-reply"
      data-lead-id={leadId}
      data-thread-id={threadId || ""}
      data-recipient-email={recipientEmail}
      aria-label="Check reply"
      title="Check reply"
    >
      <Search className="h-4 w-4" />
    </Button>
  );
}
