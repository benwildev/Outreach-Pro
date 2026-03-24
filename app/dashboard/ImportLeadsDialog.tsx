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
import { importLeads, type ImportResult } from "./importActions";

type Campaign = { id: string; name: string };

export function ImportLeadsDialog({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    const campaignId = formData.get("campaignId");
    if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
      setMessage({ type: "error", text: "Please select a campaign." });
      return;
    }
    const file = formData.get("file");
    if (!file || !(file instanceof File) || file.size === 0) {
      setMessage({ type: "error", text: "Please select a file." });
      return;
    }
    const result: ImportResult = await importLeads(formData);
    if (result.success) {
      setMessage({ type: "success", text: `${result.count} lead(s) imported.` });
      formRef.current?.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setOpen(false);
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMessage(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Import Excel</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} ref={formRef} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-campaignId">Campaign (required)</Label>
            <select
              id="import-campaignId"
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
            <Label htmlFor="import-file">File (.xlsx or .csv)</Label>
            <Input
              id="import-file"
              ref={fileInputRef}
              name="file"
              type="file"
              accept=".xlsx,.csv"
              className="cursor-pointer"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="import-start-row">Start Row (optional)</Label>
              <Input
                id="import-start-row"
                name="startRow"
                type="number"
                min="2"
                placeholder="e.g. 200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-end-row">End Row (optional)</Label>
              <Input
                id="import-end-row"
                name="endRow"
                type="number"
                min="2"
                placeholder="e.g. 2050"
              />
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${message.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
            >
              {message.text}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Import Leads</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
