"use client";

import { useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

const MAX_TEMPLATES = 5;

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
  }

  function removeTemplate(index: number) {
    if (templates.length <= 1) return;
    const next = templates.filter((_, i) => i !== index);
    setTemplates(next);
    syncHidden(next);
  }

  const jsonValue = JSON.stringify(templates.map((t) => t.trim()).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Follow-up 1 Templates
          <span className="ml-1.5 text-indigo-500 font-normal normal-case tracking-normal">
            ({templates.length}/{MAX_TEMPLATES}) — one is picked at random per lead
          </span>
        </label>
        {templates.length < MAX_TEMPLATES && (
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

      {templates.map((template, i) => (
        <div key={i} className="relative group">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 mt-2.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <Textarea
              value={template}
              onChange={(e) => update(i, e.target.value)}
              rows={4}
              placeholder={i === 0 ? "First follow-up message (required if using follow-ups)" : `Alternative template ${i + 1}`}
              className="resize-none flex-1"
            />
            {templates.length > 1 && (
              <button
                type="button"
                onClick={() => removeTemplate(i)}
                className="flex-shrink-0 mt-2.5 text-gray-300 hover:text-red-500 transition-colors"
                title="Remove template"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {templates.length < MAX_TEMPLATES && (
        <p className="text-xs text-gray-400 pl-7">
          Add up to {MAX_TEMPLATES} templates. The extension picks one at random to reduce spam detection.
        </p>
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
