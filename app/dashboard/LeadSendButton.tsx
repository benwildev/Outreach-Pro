"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendLead } from "./sendActions";
import { Check, Loader2, SendHorizontal } from "lucide-react";

interface LeadSendButtonProps {
  leadId: string;
  status: string;
}

export function LeadSendButton({ leadId, status }: LeadSendButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isSent = status.toLowerCase() === "sent";

  async function handleSend() {
    setLoading(true);
    try {
      const result = await sendLead(leadId);
      if (result.success) {
        if (result.type === "redirect") {
          window.open(result.url, "_blank");
        }
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (isSent) {
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9"
        data-action="send"
        disabled
        aria-label="Already sent"
        title="Already sent"
      >
        <Check className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="h-9 w-9"
      data-action="send"
      onClick={handleSend}
      disabled={loading}
      aria-label="Send lead"
      title="Send lead"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
    </Button>
  );
}
