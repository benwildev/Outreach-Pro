"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLead } from "./actions";

type Campaign = { id: string; name: string };

export function AddLeadDialog({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(formData: FormData) {
    await createLead(formData);
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/80 rounded-lg px-3 py-2 transition-all duration-150 shadow-sm">
          + Add Lead
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} ref={formRef} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaignId">Campaign (required)</Label>
            <select
              id="campaignId"
              name="campaignId"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientName">Recipient Name (optional)</Label>
            <Input
              id="recipientName"
              name="recipientName"
              placeholder="John Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientEmail">Recipient Email (required)</Label>
            <Input
              id="recipientEmail"
              name="recipientEmail"
              type="email"
              multiple
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL (optional, for guest post prompts)</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="text"
              placeholder="example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="niche">Niche (optional, for guest post prompts)</Label>
            <Input
              id="niche"
              name="niche"
              placeholder="e.g. marketing, SaaS, real estate"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Submit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
