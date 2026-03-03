"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendLead } from "./sendActions";

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
      <Button size="sm" variant="outline" disabled>
        Sent
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleSend}
      disabled={loading}
    >
      {loading ? "..." : "Send"}
    </Button>
  );
}
