"use client";

import { useState, useEffect, useTransition } from "react";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AllowedIpRow {
  id: string;
  ip: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
}

interface Props {
  initialIps: AllowedIpRow[];
  initialRestrictionEnabled: boolean;
  currentVisitorIp: string;
}

export function IpAllowlistCard({ initialIps, initialRestrictionEnabled, currentVisitorIp }: Props) {
  const [ips, setIps] = useState<AllowedIpRow[]>(initialIps);
  const [restrictionEnabled, setRestrictionEnabled] = useState(initialRestrictionEnabled);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, startAdding] = useTransition();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [togglingRestriction, setTogglingRestriction] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleToggleRestriction() {
    setTogglingRestriction(true);
    try {
      const res = await fetch("/api/settings/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip_restriction_enabled: !restrictionEnabled }),
      });
      if (res.ok) {
        setRestrictionEnabled((v) => !v);
        showToast(!restrictionEnabled ? "IP restriction enabled" : "IP restriction disabled");
      } else {
        showToast("Failed to update setting", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setTogglingRestriction(false);
    }
  }

  function handleAdd() {
    const ip = newIp.trim();
    if (!ip) return;
    startAdding(async () => {
      const res = await fetch("/api/settings/allowed-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, label: newLabel.trim() || null }),
      });
      if (res.ok) {
        const created = await res.json();
        setIps((prev) => [...prev, created]);
        setNewIp("");
        setNewLabel("");
        showToast(`Added ${ip}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error ?? "Failed to add IP", false);
      }
    });
  }

  async function handleDelete(id: string, ip: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/settings/allowed-ips/${id}`, { method: "DELETE" });
      if (res.ok) {
        setIps((prev) => prev.filter((r) => r.id !== id));
        showToast(`Removed ${ip}`);
      } else {
        showToast("Failed to remove IP", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id: string, currentEnabled: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/settings/allowed-ips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIps((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: updated.enabled } : r)));
        showToast(`IP ${updated.enabled ? "enabled" : "disabled"}`);
      } else {
        showToast("Failed to update IP", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800">IP Allowlist</span>
        </div>

        {/* Global restriction toggle */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-gray-500 font-medium">Restriction</span>
          <button
            onClick={handleToggleRestriction}
            disabled={togglingRestriction}
            aria-label="Toggle IP restriction"
            className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-all duration-150 ${
              restrictionEnabled
                ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {togglingRestriction ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : restrictionEnabled ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5" />
            )}
            {restrictionEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Visitor info + restriction status */}
      <div className="px-5 py-3 border-b border-gray-100 bg-indigo-50/40 flex flex-wrap gap-3 items-center justify-between text-xs text-gray-600">
        <span>
          Your current IP:{" "}
          <code className="font-mono font-semibold text-indigo-700 bg-indigo-100 rounded px-1 py-0.5">
            {currentVisitorIp || "unknown"}
          </code>
        </span>
        {restrictionEnabled ? (
          <span className="inline-flex items-center gap-1 font-semibold text-red-600">
            <Shield className="w-3 h-3" />
            Restriction active — only listed &amp; enabled IPs can access the app
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            Restriction off — all IPs are allowed
          </span>
        )}
      </div>

      {/* Add form */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 mb-2">Add IP Address</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="e.g. 203.0.113.42"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[140px] text-xs rounded-lg border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[120px] text-xs rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />
          <button
            onClick={() => { setNewIp(currentVisitorIp); }}
            disabled={!currentVisitorIp}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-2 transition-all duration-150"
          >
            Use my IP
          </button>
          <button
            onClick={handleAdd}
            disabled={adding || !newIp.trim()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 border border-indigo-500 rounded-lg px-3 py-2 transition-all duration-150"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>
      </div>

      {/* IP list */}
      <div className="overflow-x-auto">
        {ips.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400 text-sm">
            <Shield className="w-8 h-8 text-gray-200" />
            <span>No IPs in the allowlist — add one above</span>
            {restrictionEnabled && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Restriction is ON but list is empty — all IPs are allowed
              </span>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/30">
                <th className="text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide px-5 py-3">IP Address</th>
                <th className="text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">Label</th>
                <th className="text-center text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide px-4 py-3">Added</th>
                <th className="w-[120px] px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ips.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 transition-colors hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-gray-800">{row.ip}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.label ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        row.enabled
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      {row.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => handleToggle(row.id, row.enabled)}
                        disabled={togglingId === row.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        {togglingId === row.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : row.enabled ? (
                          <ToggleRight className="w-3 h-3" />
                        ) : (
                          <ToggleLeft className="w-3 h-3" />
                        )}
                        {row.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => handleDelete(row.id, row.ip)}
                        disabled={deletingId === row.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast */}
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
