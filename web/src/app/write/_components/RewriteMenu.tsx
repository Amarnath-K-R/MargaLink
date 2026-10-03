"use client";

import { PenLine } from "lucide-react";
import type { Tone, Tool } from "@/lib/writing/rewrite";
import { Coin } from "@/components/account/AccountButton";

// Rewrite's tools, with the selection's price on top (or why it can't be
// rewritten). The LaTeX formatting bar shows them in its own popover; the
// Word editor's button and right-click item, and the commands, in the card.
export type RewriteOffer = { words: number; coins: number } | string;

const TONE_LABEL: Record<Tone, string> = { academic: "Academic", concise: "Concise", confident: "Confident", plain: "Plain" };

export function RewriteMenuItems({ offer, onTool }: { offer: RewriteOffer; onTool: (tool: Tool, tone: Tone | null) => void }) {
  const off = typeof offer === "string";
  const item = (tool: Tool, label: string, tone: Tone | null = null, indent = false) => (
    <button
      key={`${tool}-${tone ?? ""}`}
      type="button"
      role="menuitem"
      disabled={off}
      onClick={() => onTool(tool, tone)}
      className={`flex w-full rounded-xl px-2.5 py-1.5 text-left hover:bg-accent-soft disabled:opacity-50 disabled:hover:bg-transparent ${indent ? "pl-6" : ""}`}
    >
      {label}
    </button>
  );
  return (
    <div data-testid="rewrite-menu">
      <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-xs text-ink-soft" data-testid="rewrite-price">
        {off ? (
          offer
        ) : (
          <>
            <Coin />
            {offer.words.toLocaleString("en")} word{offer.words === 1 ? "" : "s"}: {offer.coins} M coin{offer.coins === 1 ? "" : "s"}
          </>
        )}
      </p>
      {item("paraphrase", "Paraphrase")}
      <p className="px-2.5 pt-1.5 text-xs text-ink-soft">Change tone</p>
      {(Object.keys(TONE_LABEL) as Tone[]).map((t) => item("tone", TONE_LABEL[t], t, true))}
      {item("shorten", "Shorten")}
      {item("expand", "Expand")}
      {item("clarity", "Clarity and flow")}
    </div>
  );
}

// The Word editor's Rewrite button: its tools open in the card by the
// selection (Folio's bar clips anything that hangs below it).
export function RewriteButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Rewrite"
      title="Rewrite the selection with Claude (M coins)"
      // Pressed without taking the focus, so the document's selection stays.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-soft hover:bg-black/5 hover:text-ink"
    >
      <PenLine size={15} strokeWidth={2} />
      Rewrite
    </button>
  );
}
