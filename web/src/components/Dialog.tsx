"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// A modal window over the page, on the native <dialog>: showModal() gives
// the focus trap (the rest of the page goes inert), Escape, the top layer
// and focus back to the opener on close — no library. Focus lands on the
// first [data-autofocus] inside, else the heading. `open` false renders nothing.
const SIZES = {
  md: "w-[min(94vw,36rem)] max-h-[80vh]",
  lg: "w-[min(96vw,64rem)] h-[min(92vh,60rem)]",
  full: "w-[96vw] h-[94vh]",
} as const;

export default function Dialog({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof SIZES;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    if (!el.open) el.showModal();
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("h2"))?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (el.open) el.close();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault(); // Escape: close through onClose so the caller's state follows
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()} // the backdrop: only the <dialog> itself is under the pointer there
      className={`m-auto max-h-none max-w-none rounded-sm border border-line bg-paper p-0 text-ink shadow-[0_24px_60px_rgba(27,31,39,.25)] backdrop:bg-ink/40 ${SIZES[size]}`}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
          <h2 tabIndex={-1} className="font-serif text-lg font-medium outline-none">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-ink-soft hover:text-ink">
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
