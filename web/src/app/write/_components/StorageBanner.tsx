"use client";

// Always visible: where the drafts live, and the one way to keep them safe.
export default function StorageBanner({ onBackup }: { onBackup?: () => void }) {
  return (
    <p data-testid="storage-banner" className="rounded-sm border border-line bg-paper-alt px-3 py-2 text-sm text-ink-soft">
      Saved in this browser on this device only — nothing is uploaded. Clearing your browser&apos;s site data deletes it, so download a
      backup before you do, or to move to another computer.{" "}
      {onBackup && (
        <button type="button" onClick={onBackup} className="text-accent hover:underline">
          Download backup
        </button>
      )}
    </p>
  );
}
