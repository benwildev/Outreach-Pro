"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUE_ALL = "all";
const TAB_FOLLOWUP_DUE = "followup-due";
const STATUSES = [
  { value: TAB_VALUE_ALL, label: "All", href: "/dashboard" },
  { value: "pending", label: "Pending", href: "/dashboard?status=pending" },
  { value: "sent", label: "Sent", href: "/dashboard?status=sent" },
  { value: "replied", label: "Replied", href: "/dashboard?status=replied" },
  { value: TAB_FOLLOWUP_DUE, label: "Follow-up Due", href: "/dashboard?filter=followup-due" },
] as const;

interface DashboardTabsProps {
  currentStatus: string | null;
  filter: string | null;
}

export function DashboardTabs({ currentStatus, filter }: DashboardTabsProps) {
  const value = filter === "followup-due" ? TAB_FOLLOWUP_DUE : (currentStatus ?? TAB_VALUE_ALL);

  return (
    <Tabs value={value} className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-5">
        {STATUSES.map(({ value: v, label, href }) => (
          <TabsTrigger key={v} value={v} asChild>
            <Link href={href}>{label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
