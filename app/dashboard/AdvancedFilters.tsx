"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  currentSearchMode: "email" | "thread";
}

export function AdvancedFilters({
  campaigns,
  currentStatus,
  currentFilter,
  currentCampaignId,
  currentEmail,
  currentDateFrom,
  currentDateTo,
  currentSearchMode,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
      params.delete("searchMode");
      Object.entries(updates).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      startTransition(() => {
        router.push(`/dashboard?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  function getBaseUpdates() {
    return {
      campaign: currentCampaignId ?? "",
      email: currentEmail ?? "",
      dateFrom: currentDateFrom ?? "",
      dateTo: currentDateTo ?? "",
      searchMode: currentSearchMode === "thread" ? "thread" : "",
      ...(statusValue === "followup-due"
        ? { filter: "followup-due" }
        : statusValue
        ? { status: statusValue }
        : {}),
    };
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const updates: Record<string, string> = {
      campaign: currentCampaignId ?? "",
      email: currentEmail ?? "",
      dateFrom: currentDateFrom ?? "",
      dateTo: currentDateTo ?? "",
      searchMode: currentSearchMode === "thread" ? "thread" : "",
    };
    if (val === "followup-due") updates.filter = "followup-due";
    else if (val) updates.status = val;
    pushParams(updates);
  }

  function handleCampaignChange(e: React.ChangeEvent<HTMLSelectElement>) {
    pushParams({ ...getBaseUpdates(), campaign: e.target.value });
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    pushParams({ ...getBaseUpdates(), email: e.target.value });
  }

  function handleDateFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    pushParams({ ...getBaseUpdates(), dateFrom: e.target.value });
  }

  function handleDateToChange(e: React.ChangeEvent<HTMLInputElement>) {
    pushParams({ ...getBaseUpdates(), dateTo: e.target.value });
  }

  function handleSearchModeToggle() {
    const nextMode = currentSearchMode === "thread" ? "" : "thread";
    pushParams({ ...getBaseUpdates(), email: "", searchMode: nextMode });
  }

  function handleClear() {
    startTransition(() => {
      router.push("/dashboard");
    });
  }

  const isThreadMode = currentSearchMode === "thread";

  const selectClass =
    "h-9 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 ring-offset-background focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm transition-colors hover:border-gray-300 cursor-pointer";

  const dateClass = selectClass + " w-auto";

  return (
    <div className={`px-4 py-3 border-b border-gray-100 transition-colors ${isPending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Filter label */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter</span>
        </div>

        {/* Search box with mode toggle */}
        <div className="relative flex-1 min-w-[200px] max-w-xs flex items-center">
          {/* Mode toggle button — sits inside the left side */}
          <button
            type="button"
            onClick={handleSearchModeToggle}
            title={isThreadMode ? "Switch to email search" : "Switch to thread ID search"}
            className={`absolute left-1.5 z-10 flex items-center justify-center h-6 px-1.5 rounded text-[10px] font-bold transition-all border ${
              isThreadMode
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            }`}
          >
            {isThreadMode ? "#" : "@"}
          </button>
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={isThreadMode ? "Search by thread ID..." : "Search by email..."}
            value={currentEmail ?? ""}
            onChange={handleEmailChange}
            className={selectClass + " pl-10 pr-8 w-full"}
          />
        </div>

        {/* Status */}
        <select value={statusValue} onChange={handleStatusChange} className={selectClass}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Campaign */}
        <select value={currentCampaignId ?? ""} onChange={handleCampaignChange} className={selectClass}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1 shadow-sm">
          <span className="text-[11px] text-gray-500 whitespace-nowrap font-medium">From</span>
          <input type="date" value={currentDateFrom ?? ""} onChange={handleDateFromChange} className="h-7 text-xs bg-transparent border-none focus:outline-none text-gray-700 cursor-pointer" />
          <span className="text-[11px] text-gray-400">→</span>
          <input type="date" value={currentDateTo ?? ""} onChange={handleDateToChange} className="h-7 text-xs bg-transparent border-none focus:outline-none text-gray-700 cursor-pointer" />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-9 gap-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {statusValue && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-100">
              {STATUS_OPTIONS.find((o) => o.value === statusValue)?.label ?? statusValue}
            </span>
          )}
          {currentCampaignId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-[11px] font-medium border border-purple-100">
              {campaigns.find((c) => c.id === currentCampaignId)?.name ?? currentCampaignId}
            </span>
          )}
          {currentEmail && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              isThreadMode
                ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                : "bg-emerald-50 text-emerald-700 border-emerald-100"
            }`}>
              <span className="font-bold">{isThreadMode ? "#" : "@"}</span>
              {currentEmail}
            </span>
          )}
          {(currentDateFrom || currentDateTo) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium border border-amber-100">
              {currentDateFrom || "…"} → {currentDateTo || "…"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
