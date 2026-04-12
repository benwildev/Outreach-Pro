"use client";

import { useState, useEffect, useTransition } from "react";
import { Mail, Plus, Loader2, CheckCircle2, AlertCircle, RefreshCw, Check } from "lucide-react";

interface GmailAccountRow {
  id: string;
  email: string;
  accountIndex: number;
  source: string | null;
  updatedAt: string;
}

interface Props {
  initialFollowupEmail?: string | null;
  initialAccountIndex?: number | null;
  emailFieldName?: string;
  indexFieldName?: string;
  stepLabel?: string;
}

export default function GmailFollowupSelector({
  initialFollowupEmail,
  initialAccountIndex,
  emailFieldName = "gmailFollowupEmail",
  indexFieldName = "gmailAccountIndex",
  stepLabel,
}: Props) {
  const [accounts, setAccounts] = useState<GmailAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>(initialFollowupEmail ?? "");
  const [manualEmail, setManualEmail] = useState("");
  const [manualIndex, setManualIndex] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [saving, startSaving] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/gmail-account-map");
      if (res.ok) {
        const data = await res.json();
        const rows: GmailAccountRow[] = data.accounts ?? [];
        setAccounts(rows);
        if (initialFollowupEmail && !rows.find((r) => r.email === initialFollowupEmail)) {
          setShowManual(true);
          setManualEmail(initialFollowupEmail);
          if (initialAccountIndex != null) setManualIndex(String(initialAccountIndex));
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAccounts();
    setRefreshing(false);
  }

  function handleSelect(email: string) {
    setSelected(email === selected ? "" : email);
    setShowManual(false);
  }

  function handleSaveManual() {
    const email = manualEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      showToast("Enter a valid email address", false);
      return;
    }
    if (manualIndex !== "") {
      const idx = parseInt(manualIndex, 10);
      if (Number.isNaN(idx) || idx < 0 || idx > 9) {
        showToast("Index must be 0–9", false);
        return;
      }
    }
    startSaving(async () => {
      if (manualIndex !== "") {
        const idx = parseInt(manualIndex, 10);
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
          setSelected(email);
          setShowManual(false);
          setManualEmail("");
          setManualIndex("");
          showToast(`Saved ${email} → /u/${idx}/`);
        } else {
          showToast("Failed to save", false);
        }
      } else {
        setSelected(email);
        setShowManual(false);
        showToast(`Set to ${email} (index auto-detected)`);
      }
    });
  }

  const selectedAccount = accounts.find((a) => a.email === selected);
  const isManualSelected = selected && !selectedAccount;
  const fallbackLabel = stepLabel ?? "Follow-ups & reply checks";

  return (
    <div className="space-y-2">
      <input type="hidden" name={emailFieldName} value={selected} />
      <input type="hidden" name={indexFieldName} value={selectedAccount ? String(selectedAccount.accountIndex) : (manualIndex !== "" && isManualSelected ? manualIndex : "")} />

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50/50">
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-gray-700">Known Gmail Accounts</span>
            {selected && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold border border-indigo-200">
                <Check className="w-2.5 h-2.5" />
                {isManualSelected ? selected : selectedAccount?.email}
                {selectedAccount ? ` /u/${selectedAccount.accountIndex}/` : ""}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 rounded-lg px-2 py-1 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-xs text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading accounts…
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-gray-400">
            <Mail className="w-7 h-7 text-gray-200" />
            <span className="text-xs">No accounts detected yet</span>
            <span className="text-[11px] text-gray-400 text-center max-w-xs">
              Open Gmail with the extension installed to auto-fill this list, or add manually below.
            </span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-8 px-3 py-2" />
                <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide px-3 py-2">Email</th>
                <th className="text-center text-[10px] font-bold text-gray-500 uppercase tracking-wide px-3 py-2">/u/N/</th>
                <th className="text-center text-[10px] font-bold text-gray-500 uppercase tracking-wide px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((row) => {
                const isSelected = selected === row.email;
                return (
                  <tr
                    key={row.id}
                    onClick={() => handleSelect(row.email)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? "bg-indigo-50 hover:bg-indigo-50/80" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors ${isSelected ? "border-indigo-600 bg-indigo-600" : "border-gray-300 bg-white"}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{row.email}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {row.accountIndex}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${row.source === "auto" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {row.source === "auto" ? "auto" : "manual"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          {!showManual ? (
            <button
              type="button"
              onClick={() => { setShowManual(true); setSelected(""); }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add / enter manually
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-600">Enter email manually</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  placeholder="e.g. you@gmail.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveManual()}
                  className="flex-1 min-w-[180px] text-xs rounded-lg border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
                <input
                  type="number"
                  placeholder="Index (optional, 0–9)"
                  min={0}
                  max={9}
                  value={manualIndex}
                  onChange={(e) => setManualIndex(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveManual()}
                  className="w-[160px] text-xs rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={handleSaveManual}
                  disabled={saving || !manualEmail.trim()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 border border-blue-500 rounded-lg px-3 py-2 transition-all"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Use this
                </button>
                <button
                  type="button"
                  onClick={() => { setShowManual(false); setManualEmail(""); setManualIndex(""); }}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 bg-white rounded-lg px-3 py-2 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {selectedAccount
              ? `${fallbackLabel} will use /u/${selectedAccount.accountIndex}/ (${selected})`
              : `${fallbackLabel} will use ${selected} (index auto-detected)`}
          </p>
          <button
            type="button"
            onClick={() => { setSelected(""); setShowManual(false); }}
            className="text-[11px] text-red-500 hover:text-red-700 underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {!selected && (
        <p className="text-xs text-gray-400">
          No account selected — the extension will auto-detect the Gmail slot from the lead&apos;s sending account.
        </p>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl shadow-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${toast.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
