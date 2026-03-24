"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Campaign = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "replied", label: "Replied" },
  { value: "bounced", label: "Bounced" },
  { value: "followup-due", label: "Follow-up Due" },
];

interface AdvancedFiltersProps {
  campaigns: Campaign[];
  currentStatus: string | null;
  currentFilter: string | null;
  currentCampaignId: string | null;
  currentEmail: string | null;
  currentDateFrom: string | null;
  currentDateTo: string | null;
}

export function AdvancedFilters({
  campaigns,
  currentStatus,
  currentFilter,
  currentCampaignId,
  currentEmail,
  currentDateFrom,
  currentDateTo,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const statusValue =
    currentFilter === "followup-due" ? "followup-due" : (currentStatus ?? "");

  const hasActiveFilters =
    !!statusValue || !!currentCampaignId || !!currentEmail || !!currentDateFrom || !!currentDateTo;

  const pushParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("status");
      params.delete("filter");
      params.delete("campaign");
      params.delete("email");
      params.delete("dateFrom");
      params.delete("dateTo");
      Object.entries(updates).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      startTransition(() => {
        router.push(`/dashboard?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const updates: Record<string, string> = {
      campaign: currentCampaignId ?? "",
      email: currentEmail ?? "",
      dateFrom: currentDateFrom ?? "",
      dateTo: currentDateTo ?? "",
    };
    if (val === "followup-due") {
      updates.filter = "followup-due";
    } else if (val) {
      updates.status = val;
    }
    pushParams(updates);
  }

  function handleCampaignChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updates: Record<string, string> = {
      campaign: e.target.value,
      email: currentEmail ?? "",
      dateFrom: currentDateFrom ?? "",
      dateTo: currentDateTo ?? "",
    };
    if (statusValue === "followup-due") updates.filter = "followup-due";
    else if (statusValue) updates.status = statusValue;
    pushParams(updates);
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const updates: Record<string, string> = {
      campaign: currentCampaignId ?? "",
      email: val,
      dateFrom: currentDateFrom ?? "",
      dateTo: currentDateTo ?? "",
    };
    if (statusValue === "followup-due") updates.filter = "followup-due";
    else if (statusValue) updates.status = statusValue;
    pushParams(updates);
  }

  function handleDateFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const updates: Record<string, string> = {
      campaign: currentCampaignId ?? "",
      email: currentEmail ?? "",
      dateFrom: e.target.value,
      dateTo: currentDateTo ?? "",
    };
    if (statusValue === "followup-due") updates.filter = "followup-due";
    else if (statusValue) updates.status = statusValue;
    pushParams(updates);
  }

  function handleDateToChange(e: React.ChangeEvent<HTMLInputElement>) {
    const updates: Record<string, string> = {
      campaign: currentCampaignId ?? "",
      email: currentEmail ?? "",
      dateFrom: currentDateFrom ?? "",
      dateTo: e.target.value,
    };
    if (statusValue === "followup-due") updates.filter = "followup-due";
    else if (statusValue) updates.status = statusValue;
    pushParams(updates);
  }

  function handleClear() {
    startTransition(() => {
      router.push("/dashboard");
    });
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-white">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by email..."
            value={currentEmail ?? ""}
            onChange={handleEmailChange}
            className="h-9 pl-8 text-sm"
          />
        </div>

        <select value={statusValue} onChange={handleStatusChange} className={selectClass}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={currentCampaignId ?? ""} onChange={handleCampaignChange} className={selectClass}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">Sent from</span>
          <input
            type="date"
            value={currentDateFrom ?? ""}
            onChange={handleDateFromChange}
            className={selectClass + " w-auto"}
          />
          <span className="text-xs text-gray-500">to</span>
          <input
            type="date"
            value={currentDateTo ?? ""}
            onChange={handleDateToChange}
            className={selectClass + " w-auto"}
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-9 gap-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {statusValue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
              {STATUS_OPTIONS.find((o) => o.value === statusValue)?.label ?? statusValue}
            </span>
          )}
          {currentCampaignId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100">
              {campaigns.find((c) => c.id === currentCampaignId)?.name ?? currentCampaignId}
            </span>
          )}
          {currentEmail && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
              {currentEmail}
            </span>
          )}
          {(currentDateFrom || currentDateTo) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
              {currentDateFrom || "…"} → {currentDateTo || "…"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
