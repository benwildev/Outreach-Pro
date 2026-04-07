"use client";

import { useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronDown, ChevronUp, Upload, X, Check } from "lucide-react";

const MAX_TEMPLATES = 50;

interface Props {
  initialTemplates: string[];
  initialFollowup1: string;
}

export default function Followup1TemplatesEditor({ initialTemplates, initialFollowup1 }: Props) {
  const seed: string[] = initialTemplates.length > 0
    ? initialTemplates
    : initialFollowup1
      ? [initialFollowup1]
      : [""];

  const [templates, setTemplates] = useState<string[]>(seed);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const hiddenRef = useRef<HTMLInputElement>(null);

  function syncHidden(next: string[]) {
    if (hiddenRef.current) {
      hiddenRef.current.value = JSON.stringify(next.map((t) => t.trim()).filter(Boolean));
    }
  }

  function update(index: number, value: string) {
    const next = templates.map((t, i) => (i === index ? value : t));
    setTemplates(next);
    syncHidden(next);
  }

  function addTemplate() {
    if (templates.length >= MAX_TEMPLATES) return;
    const next = [...templates, ""];
    setTemplates(next);
    syncHidden(next);
    setExpandedIndex(next.length - 1);
  }

  function removeTemplate(index: number) {
    if (templates.length <= 1) return;
    const next = templates.filter((_, i) => i !== index);
    setTemplates(next);
    syncHidden(next);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  }

  function toggleExpand(index: number) {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  function handleBulkImport() {
    const parts = bulkText
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const combined = [...templates.map((t) => t.trim()).filter(Boolean), ...parts];
    const capped = combined.slice(0, MAX_TEMPLATES);
    const next = capped.length > 0 ? capped : [""];
    setTemplates(next);
    syncHidden(next);
    setBulkText("");
    setShowBulkImport(false);
    setExpandedIndex(null);
  }

  function cancelBulkImport() {
    setBulkText("");
    setShowBulkImport(false);
  }

  const filledCount = templates.filter((t) => t.trim().length > 0).length;
  const jsonValue = JSON.stringify(templates.map((t) => t.trim()).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Follow-up 1 Templates
          <span className="ml-1.5 text-indigo-500 font-normal normal-case tracking-normal">
            ({filledCount} / {MAX_TEMPLATES} templates) — one picked at random per lead
          </span>
        </label>
        <div className="flex items-center gap-2">
          {!showBulkImport && (
            <button
              type="button"
              onClick={() => setShowBulkImport(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 bg-white hover:bg-gray-50 rounded-md px-2.5 py-1 transition-all duration-150"
            >
              <Upload className="w-3 h-3" />
              Bulk import
            </button>
          )}
          {templates.length < MAX_TEMPLATES && !showBulkImport && (
            <button
              type="button"
              onClick={addTemplate}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-md px-2.5 py-1 transition-all duration-150"
            >
              <Plus className="w-3 h-3" />
              Add template
            </button>
          )}
        </div>
      </div>

      {showBulkImport && (
        <div className="border border-indigo-200 rounded-xl bg-indigo-50/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-indigo-800">Bulk import templates</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Paste up to {MAX_TEMPLATES} templates below, separated by <code className="bg-indigo-100 px-1 rounded font-mono">---</code> on its own line. They will be added to your existing templates.
              </p>
            </div>
            <button type="button" onClick={cancelBulkImport} className="text-gray-400 hover:text-gray-700 mt-0.5 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            placeholder={"Hi [Name],\n\nJust following up on my previous email...\n\n---\n\nHey [Name],\n\nWanted to circle back quickly...\n\n---\n\n(paste more templates separated by ---)"}
            className="resize-none text-sm font-mono"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={!bulkText.trim()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-500/80 rounded-md px-3 py-1.5 transition-all duration-150"
            >
              <Check className="w-3 h-3" />
              Import templates
            </button>
            <button type="button" onClick={cancelBulkImport} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
              Cancel
            </button>
            {bulkText.trim() && (
              <span className="text-xs text-indigo-500 ml-auto">
                ~{bulkText.split(/^\s*---\s*$/m).filter((s) => s.trim()).length} template(s) detected
              </span>
            )}
          </div>
        </div>
      )}

      {!showBulkImport && (
        <div className="space-y-1.5">
          {templates.map((template, i) => {
            const isExpanded = expandedIndex === i;
            const isEmpty = !template.trim();
            const firstLine = template.trim().split("\n")[0] || "";
            const charCount = template.trim().length;

            return (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(i)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className={`flex-1 min-w-0 text-xs truncate ${isEmpty ? "text-gray-400 italic" : "text-gray-700"}`}>
                      {isEmpty ? "Empty — click to edit" : firstLine}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-400 tabular-nums pr-1">
                      {charCount > 0 ? `${charCount} chars` : ""}
                    </span>
                    <span className="flex-shrink-0 text-gray-400">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {templates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTemplate(i)}
                      className="flex-shrink-0 px-2.5 py-2.5 text-gray-300 hover:text-red-500 transition-colors border-l border-gray-100"
                      title="Remove template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                    <Textarea
                      value={template}
                      onChange={(e) => update(i, e.target.value)}
                      rows={6}
                      autoFocus={isEmpty}
                      placeholder={i === 0 ? "First follow-up message (required if using follow-ups)" : `Alternative template ${i + 1} — the extension picks one at random`}
                      className="resize-y flex-1 text-sm mt-2.5"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!showBulkImport && templates.length < MAX_TEMPLATES && (
        <p className="text-xs text-gray-400 pl-1">
          {templates.length < 10
            ? `Add up to ${MAX_TEMPLATES} templates. The extension picks one at random per lead to reduce spam detection.`
            : `${MAX_TEMPLATES - templates.length} slots remaining.`}
        </p>
      )}
      {!showBulkImport && templates.length >= MAX_TEMPLATES && (
        <p className="text-xs text-indigo-500 pl-1 font-medium">Maximum of {MAX_TEMPLATES} templates reached.</p>
      )}

      <input
        ref={hiddenRef}
        type="hidden"
        name="followup1Templates"
        defaultValue={jsonValue}
      />
    </div>
  );
}
