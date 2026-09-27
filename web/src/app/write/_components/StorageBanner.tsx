"use client";

import { HardDrive } from "lucide-react";

// Always visible: where the drafts live, and the one way to keep them safe.
// `compact` is the workspace's version, at the foot of the file list.
export default function StorageBanner({ onBackup, compact = false }: { onBackup?: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <div data-testid="storage-banner" className="clay-well mt-3 p-2.5 text-[11px] leading-snug text-ink-soft">
        <p className="flex gap-1.5">
          <HardDrive size={12} strokeWidth={2} className="mt-px shrink-0 text-accent" />
          <span>Saved in this browser only. Clearing its site data deletes it.</span>
        </p>
        {onBackup && (
          <button type="button" onClick={onBackup} className="clay-btn mt-2 h-7 w-full justify-center text-xs">
            Download backup
          </button>
        )}
      </div>
    );
  }
  return (
    <p data-testid="storage-banner" className="clay-well flex gap-3 rounded-2xl px-4 py-3 text-sm leading-relaxed text-ink-soft">
      <HardDrive aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
      <span>
        Saved in this browser on this device only — nothing is uploaded. Clearing your browser&apos;s site data deletes it, so download a
        backup before you do, or to move to another computer.{" "}
        {onBackup && (
          <button type="button" onClick={onBackup} className="text-accent hover:underline">
            Download backup
          </button>
        )}
      </span>
    </p>
  );
}
