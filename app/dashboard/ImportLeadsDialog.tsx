"use client";

import { useRef, useState, useEffect } from "react";
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
import { importLeads, importLeadsFromGSheets, type ImportResult } from "./importActions";
import { History, FileSpreadsheet, Link2 } from "lucide-react";

type Campaign = { id: string; name: string };

type ImportLog = {
  id: string;
  fileName: string;
  startRow: number;
  endRow: number;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
};

type ImportMode = "file" | "gsheets";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatLogSource(fileName: string) {
  if (fileName.startsWith("gsheets:")) {
    return <span className="text-indigo-500 font-medium">Google Sheet</span>;
  }
  return <span className="text-slate-300 truncate max-w-[140px]">{fileName}</span>;
}

function SuccessMessage({ text, skipped }: { text: string; skipped?: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-green-600 dark:text-green-400">{text}</p>
      {(skipped ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
          <p className="text-xs text-amber-800">
            <strong>{skipped} duplicate{skipped !== 1 ? "s" : ""} skipped</strong> — these emails already exist in the selected campaign and were not re-imported.
          </p>
        </div>
      )}
    </div>
  );
}

export function ImportLeadsDialog({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startRowRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("file");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; skipped?: number } | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [nextStartRow, setNextStartRow] = useState<number | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [importing, setImporting] = useState(false);

  function resetForm() {
    setMessage(null);
    setSelectedCampaignId("");
    setImportLogs([]);
    setNextStartRow(null);
    setSheetNames([]);
    setSelectedSheet("");
    setSheetUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    formRef.current?.reset();
  }

  useEffect(() => {
    if (!selectedCampaignId) {
      setImportLogs([]);
      setNextStartRow(null);
      return;
    }
    setLoadingLogs(true);
    fetch(`/api/import-logs?campaignId=${selectedCampaignId}`)
      .then((r) => r.json())
      .then((data) => {
        setImportLogs(data.logs ?? []);
        setNextStartRow(data.nextStartRow ?? null);
        if (data.nextStartRow && startRowRef.current) {
          startRowRef.current.value = String(data.nextStartRow);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, [selectedCampaignId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSheetNames([]);
      setSelectedSheet("");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", bookSheets: true });
      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0] ?? "");
    } catch {
      setSheetNames([]);
      setSelectedSheet("");
    }
  }

  function handleSuccess(result: Extract<ImportResult, { success: true }>) {
    const parts: string[] = [];
    parts.push(result.count > 0 ? `${result.count} lead${result.count !== 1 ? "s" : ""} imported` : "0 leads imported");
    if (result.skipped > 0) parts.push(`${result.skipped} skipped (duplicates)`);
    parts.push(`Next start row: ${result.nextStartRow}`);
    setMessage({ type: "success", text: parts.join(" · "), skipped: result.skipped });
    resetForm();
    router.refresh();
  }

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setImporting(true);

    const campaignId = formData.get("campaignId");
    if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
      setMessage({ type: "error", text: "Please select a campaign." });
      setImporting(false);
      return;
    }

    try {
      if (mode === "gsheets") {
        if (!sheetUrl.trim()) {
          setMessage({ type: "error", text: "Please paste a Google Sheets URL." });
          return;
        }
        formData.set("sheetUrl", sheetUrl.trim());
        const result = await importLeadsFromGSheets(formData);
        if (result.success) {
          handleSuccess(result);
        } else {
          setMessage({ type: "error", text: result.error });
        }
      } else {
        const file = formData.get("file");
        if (!file || !(file instanceof File) || file.size === 0) {
          setMessage({ type: "error", text: "Please select a file." });
          return;
        }
        if (selectedSheet) formData.set("sheetName", selectedSheet);
        const result = await importLeads(formData);
        if (result.success) {
          handleSuccess(result);
        } else {
          setMessage({ type: "error", text: result.error });
        }
      }
    } finally {
      setImporting(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all duration-150 ${
      active
        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
        : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
    }`;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (!o) resetForm();
    }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150">
          ↑ Import
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import Leads</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} ref={formRef} className="space-y-4 overflow-y-auto pr-1 flex-1">

          {/* Mode tabs */}
          <div className="flex items-center gap-2">
            <button type="button" className={tabClass(mode === "file")} onClick={() => { setMode("file"); setMessage(null); }}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Upload File
            </button>
            <button type="button" className={tabClass(mode === "gsheets")} onClick={() => { setMode("gsheets"); setMessage(null); }}>
              <Link2 className="w-3.5 h-3.5" />
              Google Sheet URL
            </button>
          </div>

          {/* Campaign selector */}
          <div className="space-y-2">
            <Label htmlFor="import-campaignId">Campaign (required)</Label>
            <select
              id="import-campaignId"
              name="campaignId"
              required
              value={selectedCampaignId}
              onChange={(e) => {
                setSelectedCampaignId(e.target.value);
                setMessage(null);
                if (startRowRef.current) startRowRef.current.value = "";
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Import history */}
          {selectedCampaignId && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Import History</span>
              </div>
              {loadingLogs ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : importLogs.length === 0 ? (
                <p className="text-xs text-slate-400">No previous imports for this campaign.</p>
              ) : (
                <ul className="space-y-1">
                  {importLogs.map((log) => (
                    <li key={log.id} className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-slate-700">Rows {log.startRow}–{log.endRow}</span>
                      <span className="text-green-600">{log.importedCount} imported</span>
                      {log.skippedCount > 0 && <span className="text-amber-600">{log.skippedCount} skipped</span>}
                      <span className="text-slate-400">{formatDate(log.createdAt)}</span>
                      {formatLogSource(log.fileName)}
                    </li>
                  ))}
                </ul>
              )}
              {nextStartRow && (
                <p className="mt-2 text-xs font-semibold text-indigo-600">
                  Suggested next start row: {nextStartRow}
                </p>
              )}
            </div>
          )}

          {/* File upload mode */}
          {mode === "file" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="import-file">File (.xlsx or .csv)</Label>
                <Input
                  id="import-file"
                  ref={fileInputRef}
                  name="file"
                  type="file"
                  accept=".xlsx,.csv"
                  className="cursor-pointer"
                  onChange={handleFileChange}
                />
              </div>
              {sheetNames.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="import-sheet">Sheet Tab</Label>
                  <select
                    id="import-sheet"
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    {sheetNames.length} tabs found — select which one to import from.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Google Sheets URL mode */}
          {mode === "gsheets" && (
            <div className="space-y-2">
              <Label htmlFor="import-sheet-url">Google Sheets URL</Label>
              <Input
                id="import-sheet-url"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                Paste the full URL from your browser. The sheet must be shared as{" "}
                <strong>"Anyone with the link can view"</strong>. The tab is determined by the{" "}
                <code className="bg-slate-100 px-1 rounded text-[11px]">#gid=</code> in your URL.
              </p>
            </div>
          )}

          {/* Row range (shared) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="import-start-row">Start Row (optional)</Label>
              <Input
                id="import-start-row"
                ref={startRowRef}
                name="startRow"
                type="number"
                min="2"
                placeholder={nextStartRow ? String(nextStartRow) : "e.g. 200"}
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

          {/* Result message */}
          {message && (
            message.type === "success"
              ? <SuccessMessage text={message.text} skipped={message.skipped} />
              : <p className="text-sm text-destructive">{message.text}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={importing}>
              {importing ? "Importing…" : "Import Leads"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
