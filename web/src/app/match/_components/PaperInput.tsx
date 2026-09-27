"use client";

import { useState } from "react";
import PaperDropzone from "@/components/PaperDropzone";

// Two ways in: a file (read in this tab), or the title and abstract pasted —
// the lighter path for a phone or a paper that isn't a PDF/DOCX yet.
export default function PaperInput({ busy, onFile, onPaste }: { busy: boolean; onFile: (f: File) => void; onPaste: (text: string) => void }) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const tab = (m: "file" | "paste", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${mode === m ? "bg-white text-ink shadow-[0_1px_2px_rgba(58,44,28,.14),0_3px_8px_-2px_rgba(58,44,28,.14)]" : "text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div role="tablist" aria-label="How to give us your paper" className="clay-well mb-4 inline-flex gap-1 rounded-full p-1">
        {tab("file", "Upload a file")}
        {tab("paste", "Paste title and abstract")}
      </div>
      {mode === "file" ? (
        <PaperDropzone busy={busy} onFile={onFile} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 50) onPaste(text);
          }}
        >
          <textarea
            aria-label="Title and abstract"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Your title on the first line\nthen the abstract"}
            className="clay-input h-56 w-full resize-none text-sm"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">Stays in this tab. Without a reference list, the citation signal is off.</p>
            <button
              type="submit"
              disabled={busy || text.trim().length < 50}
              className="clay-btn clay-primary shrink-0 px-4"
            >
              Find journals
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
