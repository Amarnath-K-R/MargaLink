"use client";

import { useRef, useState } from "react";

// Shared upload control for /match and /review — drag/drop or click, a real
// <button> (not a div[role=button]) so keyboard activation reliably opens
// the native file picker in every browser.
export default function PaperDropzone({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (file: File) => void;
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
      aria-label="Upload a PDF or DOCX paper"
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
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="font-medium">Drop a PDF or DOCX</p>
      <p className="text-sm text-ink-soft">or click to choose a file</p>
    </button>
  );
}
