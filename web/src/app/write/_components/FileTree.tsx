"use client";

import { Fragment, useRef } from "react";
import { BookMarked, Braces, File, FileText, Folder, Image as ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";

const isText = (p: string) => /\.(tex|bib|cls|sty|bst|txt|md|def|cfg)$/i.test(p);

function FileIcon({ path }: { path: string }) {
  const props = { size: 13, strokeWidth: 1.9, className: "shrink-0 opacity-70" };
  if (/\.tex$/i.test(path)) return <FileText {...props} />;
  if (/\.bib$/i.test(path)) return <BookMarked {...props} />;
  if (/\.json$/i.test(path)) return <Braces {...props} />;
  if (/\.(pdf|png|jpe?g|eps|svg)$/i.test(path)) return <ImageIcon {...props} />;
  return <File {...props} />;
}

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
    <nav aria-label="Project files" data-testid="file-tree" className="flex min-h-0 flex-1 flex-col text-sm">
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-auto px-1 py-0.5">
        {files.map((f, i) => {
          // Files in a folder sit under its name; the button's text stays the full path.
          const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
          const prevDir = i > 0 && files[i - 1].includes("/") ? files[i - 1].slice(0, files[i - 1].lastIndexOf("/")) : "";
          return (
            <Fragment key={f}>
              {dir && dir !== prevDir && (
                <li aria-hidden className="flex items-center gap-1.5 px-2 pb-0.5 pt-2 text-[11px] text-ink-soft">
                  <Folder size={12} strokeWidth={1.9} />
                  {dir}
                </li>
              )}
              <li className={`group flex items-center gap-1 rounded-[10px] px-2 transition-colors ${dir ? "ml-3" : ""} ${f === active ? "clay-well text-accent" : "hover:bg-white/60"}`}>
                <button
                  type="button"
                  onClick={() => onOpen(f)}
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left font-mono text-xs ${isText(f) || f === active ? "" : "text-ink-soft"}`}
                  title={f}
                >
                  <FileIcon path={f} />
                  <span className="truncate">
                    {dir && <span className="sr-only">{dir}/</span>}
                    {dir ? f.slice(dir.length + 1) : f}
                  </span>
                  {f === main ? <span className="text-accent"> ★</span> : ""}
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${f}`}
                  onClick={() => {
                    const to = window.prompt("Rename to", f)?.trim();
                    if (to && to !== f) onRename(f, to);
                  }}
                  className="rounded-md p-1 text-ink-soft opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
                {f !== main && (
                  <button
                    type="button"
                    aria-label={`Delete ${f}`}
                    onClick={() => window.confirm(`Delete ${f}?`) && onDelete(f)}
                    className="rounded-md p-1 text-ink-soft opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("New file name (e.g. sections/intro.tex)")?.trim();
            if (name) onCreate(name);
          }}
          className="clay-btn h-7 flex-1 justify-center px-2.5 text-xs"
        >
          <Plus size={12} strokeWidth={2.2} />
          New file
        </button>
        <button type="button" onClick={() => upload.current?.click()} className="clay-btn h-7 flex-1 justify-center px-2.5 text-xs">
          <Upload size={12} strokeWidth={2.2} />
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
