"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

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
      className={`group flex h-56 w-full flex-col items-center justify-center gap-2 rounded-[20px] text-center transition-[background,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
        busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${
        dragOver
          ? "bg-accent-soft shadow-[inset_0_0_0_2px_rgba(44,95,111,.55),inset_0_3px_8px_rgba(44,95,111,.15)]"
          : "bg-[#ebe8df] shadow-[inset_0_3px_7px_rgba(58,44,28,.13),inset_0_-1px_0_rgba(255,255,255,.85)] hover:bg-[#e8e5db]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <span
        aria-hidden
        className={`bead mb-1 h-12 w-12 transition-transform duration-200 ${dragOver ? "-translate-y-1" : "group-hover:-translate-y-0.5"}`}
        style={{ background: "#fbfaf6" }}
      >
        <Upload size={20} strokeWidth={1.8} />
      </span>
      <p className="font-serif text-lg font-medium">{title}</p>
      <p className="text-sm text-ink-soft">{hint}</p>
    </button>
  );
}
