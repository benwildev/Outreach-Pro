"use client";

import { useState, useRef, useEffect } from "react";
import { FileDown, ChevronDown } from "lucide-react";

interface Props {
  baseParams: string;
}

export default function ExportDropdown({ baseParams }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function buildUrl(step?: number) {
    const params = new URLSearchParams(baseParams || "");
    if (step != null) params.set("step", String(step));
    const qs = params.toString();
    return `/api/export-leads${qs ? `?${qs}` : ""}`;
  }

  const options = [
    { label: "All leads", url: buildUrl() },
    { label: "Follow-up 1 only", url: buildUrl(1) },
    { label: "Follow-up 2 only", url: buildUrl(2) },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
      >
        <FileDown className="w-3.5 h-3.5" />
        Export CSV
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
          {options.map((opt) => (
            <a
              key={opt.label}
              href={opt.url}
              download
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5 text-gray-400" />
              {opt.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
