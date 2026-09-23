"use client";

import { useRef, useState } from "react";

// Shared upload control for /match, /review, and /figures — drag/drop or
// click, a real <button> (not a div[role=button]) so keyboard activation
// reliably opens the native file picker in every browser. The file-type
// specifics default to /match and /review's original PDF/DOCX copy;
// /figures overrides all four for CSV/XLSX.
export default function PaperDropzone({
  busy,
  onFile,
  accept = ".pdf,.docx",
  title = "Drop a PDF or DOCX",
  hint = "or click to choose a file",
  ariaLabel = "Upload a PDF or DOCX paper",
}: {
  busy: boolean;
  onFile: (file: File) => void;
  accept?: string;
  title?: string;
  hint?: string;
  ariaLabel?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (busy) return;
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={ariaLabel}
      onDragOver={(e) => {
        if (busy) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex h-56 flex-col items-center justify-center gap-2 rounded-sm border text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
        busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${dragOver ? "border-accent bg-accent-soft" : "border-line bg-paper-alt"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-ink-soft">{hint}</p>
    </button>
  );
}
