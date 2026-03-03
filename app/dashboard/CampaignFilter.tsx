"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Campaign = { id: string; name: string };

export function CampaignFilter({
  campaigns,
  currentCampaignId,
}: {
  campaigns: Campaign[];
  currentCampaignId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("campaign", value);
    } else {
      params.delete("campaign");
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <select
      value={currentCampaignId ?? ""}
      onChange={handleChange}
      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <option value="">All campaigns</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
