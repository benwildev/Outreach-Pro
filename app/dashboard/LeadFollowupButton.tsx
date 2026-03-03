"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendFollowup } from "./followupActions";

interface LeadFollowupButtonProps {
  leadId: string;
  status: string;
  step: number;
  nextFollowup: Date | null;
  followup1: string | null;
  followup2: string | null;
}

export function LeadFollowupButton({
  leadId,
  status,
  step,
  nextFollowup,
  followup1,
  followup2,
}: LeadFollowupButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const isDue =
    status === "sent" &&
    step < 3 &&
    nextFollowup != null &&
    nextFollowup <= now &&
    ((step === 1 && (followup1 ?? "").trim() !== "") ||
      (step === 2 && (followup2 ?? "").trim() !== ""));

  async function handleFollowup() {
    setLoading(true);
    try {
      const result = await sendFollowup(leadId);
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

  if (status !== "sent") return null;

  if (!isDue) {
    return (
      <Button size="sm" variant="outline" disabled>
        Not Due
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleFollowup}
      disabled={loading}
    >
      {loading ? "..." : "Send Follow-up"}
    </Button>
  );
}
