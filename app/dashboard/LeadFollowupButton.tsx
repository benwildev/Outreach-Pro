"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendFollowup } from "./followupActions";
import { Clock3, CornerUpLeft, Loader2 } from "lucide-react";

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
  const canFollowup =
    status === "sent" &&
    step < 3 &&
    ((step === 1 && (followup1 ?? "").trim() !== "") ||
      (step === 2 && (followup2 ?? "").trim() !== ""));

  const isDue =
    canFollowup &&
    nextFollowup != null &&
    nextFollowup <= now;

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

  if (!canFollowup) {
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9"
        data-action="followup"
        disabled
        aria-label="Follow-up not due"
        title="Follow-up not due"
      >
        <Clock3 className="h-4 w-4" opacity={0.5} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={`h-9 w-9 ${!isDue ? "border-amber-400 text-amber-600 hover:bg-amber-50" : "border-gray-200"}`}
      data-action="followup"
      onClick={handleFollowup}
      disabled={loading}
      aria-label={isDue ? "Send follow-up" : "Force send early follow-up"}
      title={isDue ? "Send follow-up" : "Force send early follow-up"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerUpLeft className="h-4 w-4" />}
    </Button>
  );
}
