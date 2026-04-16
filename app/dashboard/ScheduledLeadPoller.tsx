"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ScheduledLead {
  id: string;
  sentAt: Date | string | null;
}

interface ScheduledLeadPollerProps {
  scheduledLeads: ScheduledLead[];
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Invisible component that watches scheduled leads and auto-refreshes
 * the dashboard when their sentAt delivery time has passed.
 * Runs every 60 s so the status flips to "Sent" without manual reload.
 */
export function ScheduledLeadPoller({ scheduledLeads }: ScheduledLeadPollerProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (scheduledLeads.length === 0) return;

    function check() {
      const now = Date.now();
      const anyDue = scheduledLeads.some((l) => {
        if (!l.sentAt) return false;
        return new Date(l.sentAt).getTime() <= now;
      });
      if (anyDue) {
        router.refresh();
      }
    }

    check();
    timerRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, [scheduledLeads, router]);

  return null;
}
