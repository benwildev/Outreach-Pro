"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LeadMessagePreviewButton({
  subject,
  body,
}: {
  subject: string | null;
  body: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!body) {
    return <span className="inline-flex h-9 items-center text-xs text-muted-foreground">-</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => setOpen(true)}
        aria-label="Preview sent message"
        title="Preview sent message"
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sent Message Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subject
              </div>
              <div className="mt-1 rounded-md border bg-slate-50 px-3 py-2 text-sm">
                {subject || "-"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Body
              </div>
              <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border bg-slate-50 px-3 py-3 text-sm leading-6 whitespace-pre-wrap">
                {body}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
