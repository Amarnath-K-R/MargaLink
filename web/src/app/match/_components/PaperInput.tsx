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
      className={`border-b-2 px-1 pb-1 text-sm ${mode === m ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div role="tablist" aria-label="How to give us your paper" className="mb-3 flex gap-4">
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
            className="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">Stays in this tab. Without a reference list, the citation signal is off.</p>
            <button
              type="submit"
              disabled={busy || text.trim().length < 50}
              className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Find journals
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
