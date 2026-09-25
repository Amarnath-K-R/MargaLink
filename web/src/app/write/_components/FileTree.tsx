"use client";

import { useRef } from "react";

const isText = (p: string) => /\.(tex|bib|cls|sty|bst|txt|md|def|cfg)$/i.test(p);

// The project's files: open, add, upload, rename, delete. Folders are just
// path prefixes ("figures/plot.pdf").
export default function FileTree({
  files,
  active,
  main,
  onOpen,
  onCreate,
  onUpload,
  onRename,
  onDelete,
}: {
  files: string[];
  active: string;
  main: string;
  onOpen: (path: string) => void;
  onCreate: (path: string) => void;
  onUpload: (files: FileList) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (path: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  return (
    <nav aria-label="Project files" data-testid="file-tree" className="text-sm">
      <ul className="space-y-0.5">
        {files.map((f) => (
          <li key={f} className={`group flex items-center gap-1 rounded-sm px-1 ${f === active ? "bg-accent-soft" : ""}`}>
            <button
              type="button"
              onClick={() => onOpen(f)}
              className={`min-w-0 flex-1 truncate py-0.5 text-left font-mono text-xs ${isText(f) ? "" : "text-ink-soft"}`}
              title={f}
            >
              {f}
              {f === main ? " ★" : ""}
            </button>
            <button
              type="button"
              aria-label={`Rename ${f}`}
              onClick={() => {
                const to = window.prompt("Rename to", f)?.trim();
                if (to && to !== f) onRename(f, to);
              }}
              className="hidden text-xs text-ink-soft hover:text-ink group-hover:inline"
            >
              rename
            </button>
            {f !== main && (
              <button
                type="button"
                aria-label={`Delete ${f}`}
                onClick={() => window.confirm(`Delete ${f}?`) && onDelete(f)}
                className="hidden text-xs text-ink-soft hover:text-ink group-hover:inline"
              >
                delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("New file name (e.g. sections/intro.tex)")?.trim();
            if (name) onCreate(name);
          }}
          className="text-accent hover:underline"
        >
          New file
        </button>
        <button type="button" onClick={() => upload.current?.click()} className="text-accent hover:underline">
          Upload files
        </button>
        <input
          ref={upload}
          type="file"
          multiple
          aria-label="Upload files to this project"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </nav>
  );
}
