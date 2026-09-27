"use client";

import { Fragment, useRef, useState } from "react";
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

// The project's files: open, add, upload (or drop files here), rename,
// delete. Naming and deleting happen in place — an input on the row, a
// confirm on the row — never in a browser pop-up. Folders are just path
// prefixes ("figures/plot.pdf").
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dropping, setDropping] = useState(false);
  return (
    <nav
      aria-label="Project files"
      data-testid="file-tree"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
      }}
      className={`-m-1 flex min-h-0 flex-1 flex-col rounded-2xl p-1 text-sm transition-shadow ${dropping ? "bg-accent-soft/60 shadow-[inset_0_0_0_2px_rgba(44,95,111,.5)]" : ""}`}
    >
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
              {renaming === f ? (
                <li className={dir ? "ml-3" : ""}>
                  <NameInput
                    label={`New name for ${f}`}
                    initial={f}
                    onDone={(to) => {
                      setRenaming(null);
                      if (to && to !== f) onRename(f, to);
                    }}
                  />
                </li>
              ) : deleting === f ? (
                <li className={`rounded-[10px] bg-white/70 px-2.5 py-2 text-xs ${dir ? "ml-3" : ""}`} role="group" aria-label={`Delete ${f}?`}>
                  <p className="break-all">
                    Delete <span className="font-mono">{f.slice(f.lastIndexOf("/") + 1)}</span>?
                  </p>
                  <span className="mt-1.5 flex gap-1.5">
                    <button type="button" aria-label={`Confirm delete ${f}`} onClick={() => (setDeleting(null), onDelete(f))} className="clay-chip h-6 px-2.5">
                      Delete
                    </button>
                    <button type="button" autoFocus onClick={() => setDeleting(null)} className="h-6 rounded-full px-2.5 text-ink-soft hover:bg-[#ebe8df]">
                      Keep
                    </button>
                  </span>
                </li>
              ) : (
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
                  onClick={() => setRenaming(f)}
                  className="rounded-md p-1 text-ink-soft opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
                {f !== main && (
                  <button
                    type="button"
                    aria-label={`Delete ${f}`}
                    onClick={() => setDeleting(f)}
                    className="rounded-md p-1 text-ink-soft opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                )}
              </li>
              )}
            </Fragment>
          );
        })}
        {creating && (
          <li>
            <NameInput
              label="New file name"
              initial=""
              placeholder="sections/intro.tex"
              onDone={(name) => {
                setCreating(false);
                if (name) onCreate(name);
              }}
            />
          </li>
        )}
      </ul>
      {dropping && <p className="px-2 pt-1 text-xs text-accent">Drop to add to the project (images go to figures/).</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setCreating(true)}
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

// A name typed in place: Enter or leaving the field keeps it, Escape cancels.
function NameInput({ label, initial, placeholder, onDone }: { label: string; initial: string; placeholder?: string; onDone: (name: string | null) => void }) {
  return (
    <input
      aria-label={label}
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      onFocus={(e) => {
        const dot = e.currentTarget.value.lastIndexOf(".");
        e.currentTarget.setSelectionRange(e.currentTarget.value.lastIndexOf("/") + 1, dot > 0 ? dot : e.currentTarget.value.length); // the name, not the folder or extension
      }}
      onBlur={(e) => onDone(e.target.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = ""; // the blur that follows then cancels
          e.currentTarget.blur();
        }
      }}
      className="clay-input h-8 w-full py-0 font-mono text-xs"
    />
  );
}
