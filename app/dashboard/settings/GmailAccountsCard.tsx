"use client";

import { useState, useTransition } from "react";
import { Mail, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, RefreshCw, ScanLine, Wifi, WifiOff } from "lucide-react";
import { sendRuntimeMessage } from "@/app/dashboard/extensionBridge";

interface GmailAccountRow {
  id: string;
  email: string;
  accountIndex: number;
  source: string | null;
  updatedAt: string;
}

interface Props {
  initialAccounts: GmailAccountRow[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function GmailAccountsCard({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<GmailAccountRow[]>(initialAccounts);
  const [newEmail, setNewEmail] = useState("");
  const [newIndex, setNewIndex] = useState("");
  const [adding, startAdding] = useTransition();
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/gmail-account-map");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      } else {
        showToast("Failed to refresh", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleScan() {
    setScanNote(null);
    setScanning(true);
    try {
      const result = await sendRuntimeMessage({ action: "scanGmailAccounts" });
      if (result?.accounts && result.accounts.length > 0) {
        const newRows: GmailAccountRow[] = result.accounts.map((a: any) => ({
          ...a,
          updatedAt: a.updatedAt ?? new Date().toISOString(),
        }));
        setAccounts((prev) => {
          const merged = [...prev];
          for (const row of newRows) {
            const idx = merged.findIndex((a) => a.email === row.email);
            if (idx >= 0) merged[idx] = row;
            else merged.push(row);
          }
          return merged.sort((a, b) => a.accountIndex - b.accountIndex);
        });
        showToast(`Detected ${newRows.length} account${newRows.length !== 1 ? "s" : ""} from this computer`);
      } else {
        const note = result?.note ?? "No Gmail accounts found on this computer. Make sure you are signed in to Gmail in this browser.";
        setScanNote(note);
        showToast(note, false);
      }
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      if (msg.includes("timeout") || msg.includes("runtime")) {
        setScanNote("Extension not detected. Make sure the Benwill extension is installed and enabled in this browser.");
        showToast("Extension not reachable — is it installed in this browser?", false);
      } else {
        showToast(msg, false);
      }
    } finally {
      setScanning(false);
    }
  }

  function handleAdd() {
    const email = newEmail.trim().toLowerCase();
    const idx = parseInt(newIndex.trim(), 10);
    if (!email.includes("@")) {
      showToast("Enter a valid email address", false);
      return;
    }
    if (Number.isNaN(idx) || idx < 0 || idx > 9) {
      showToast("Index must be 0–9", false);
      return;
    }
    startAdding(async () => {
      const res = await fetch("/api/gmail-account-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accountIndex: idx, source: "manual" }),
      });
      if (res.ok) {
        const data = await res.json();
        const row = data.account as GmailAccountRow;
        setAccounts((prev) => {
          const filtered = prev.filter((a) => a.email !== row.email);
          return [...filtered, row].sort((a, b) => a.accountIndex - b.accountIndex);
        });
        setNewEmail("");
        setNewIndex("");
        showToast(`Saved ${email} → /u/${idx}/`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error ?? "Failed to save", false);
      }
    });
  }

  async function handleDelete(email: string) {
    setDeletingEmail(email);
    try {
      const res = await fetch(`/api/gmail-account-map?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.email !== email));
        showToast(`Removed ${email}`);
      } else {
        showToast("Failed to remove", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setDeletingEmail(null);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm(`Delete all ${accounts.length} account mapping${accounts.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeletingAll(true);
    let failed = 0;
    for (const acct of accounts) {
      try {
        const res = await fetch(`/api/gmail-account-map?email=${encodeURIComponent(acct.email)}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }
    setAccounts([]);
    if (failed > 0) showToast(`Removed with ${failed} error(s)`, false);
    else showToast("All account mappings cleared");
    setDeletingAll(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden mt-5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50/50">
        <div className="flex items-center gap-2.5">
          <Mail className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-800">Gmail Account Index Map</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Scan this computer */}
          <button
            onClick={handleScan}
            disabled={scanning || refreshing}
            title="Detect Gmail accounts signed in to this browser and save their /u/N/ index"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition-all duration-150 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            {scanning ? "Scanning…" : "Scan this computer"}
          </button>
          {/* Refresh from DB */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || scanning}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-all duration-150"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 bg-blue-50/30 text-xs text-gray-600">
        Maps Gmail account emails to their <code className="font-mono bg-blue-100 text-blue-700 rounded px-1">/u/N/</code> slot number.
        {" "}Click <span className="font-semibold text-indigo-600">Scan this computer</span> on any machine to detect its Gmail accounts automatically.
        Entries are shared across all computers via the database.
      </div>

      {scanNote && (
        <div className="px-5 py-3 border-b border-yellow-100 bg-yellow-50 flex items-start gap-2">
          <WifiOff className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-800">{scanNote}</p>
        </div>
      )}

      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 mb-2">Add / Update Account Manually</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="e.g. nick@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[200px] text-xs rounded-lg border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
          />
          <input
            type="number"
            placeholder="Index (0–9)"
            min={0}
            max={9}
            value={newIndex}
            onChange={(e) => setNewIndex(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="w-[120px] text-xs rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newEmail.trim() || newIndex === ""}
            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 border border-blue-500 rounded-lg px-3 py-2 transition-all duration-150"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400 text-sm">
            <Mail className="w-8 h-8 text-gray-200" />
            <span>No accounts mapped yet</span>
            <span className="text-xs text-gray-400 text-center max-w-xs">
              Click <span className="font-semibold text-indigo-600">Scan this computer</span> to auto-detect accounts, or add manually above.
            </span>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50/30">
                  <th className="text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide px-5 py-3">Email</th>
                  <th className="text-center text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">/u/N/</th>
                  <th className="text-center text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">Source</th>
                  <th className="text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">Last Updated</th>
                  <th className="w-[60px] px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 transition-colors hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                  >
                    <td className="px-5 py-3 font-mono text-sm text-gray-800">{row.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                        {row.accountIndex}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          row.source === "auto"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {row.source === "auto" ? <Wifi className="w-2.5 h-2.5" /> : null}
                        {row.source === "auto" ? "auto" : "manual"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{relativeTime(row.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(row.email)}
                        disabled={deletingEmail === row.email || deletingAll}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        {deletingEmail === row.email ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Delete all footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex justify-end">
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll || accounts.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 bg-white hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                {deletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete all entries
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl shadow-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
            toast.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
