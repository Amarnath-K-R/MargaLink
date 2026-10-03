"use client";

import { useEffect, useRef, useState } from "react";
import { NotEnoughCoinsError, REWRITE_WORDS_PER_COIN, SignInRequiredError, WELCOME_COINS, rewritePrice } from "@/lib/accounts/coins";
import { currentAccount, refreshAccount, setBalance } from "@/components/account/useAccount";
import SignInPanel from "@/components/account/SignInPanel";
import ErrorText from "@/components/ui/ErrorText";
import RewriteConsent from "@/components/writing/RewriteConsent";
import { requestRewrite } from "@/lib/writing/rewriteClient";
import { parseRewriteRequest, rewriteWords, type Tone, type Tool } from "@/lib/writing/rewrite";
import type { Spelling } from "@/lib/writing/spelling";
import RewriteCard, { RewriteDiff } from "./RewriteCard";
import { RewriteMenuItems, type RewriteOffer } from "./RewriteMenu";

// What an editor gives Rewrite: the selection read as a passage (or why it
// can't be), and where it is on screen.
export type RewriteSelection = {
  passage: string; // what's sent: the selection with its objects as placeholders
  before: string; // the selection as the person sees it, for the diff
  show: (text: string) => string; // an answer as the person will see it (and copy it)
  place: (text: string) => "applied" | "stale" | "refused"; // an answer put in, as one undo step
};
export type RewriteTarget = {
  format: "latex" | "text";
  read: () => RewriteSelection | string;
  anchor: () => { left: number; top: number; above: number } | null; // the selection's left edge, just under it and just over it, in the viewport
};

type Job = { sel: RewriteSelection; format: "latex" | "text"; tool: Tool; tone: Tone | null; coins: number };
type Stage =
  | { kind: "menu"; offer: RewriteOffer }
  | { kind: "consent"; job: Job }
  | { kind: "running"; job: Job }
  | { kind: "done"; job: Job; text: string; notes: string[] }
  | { kind: "stale"; job: Job; text: string }
  | { kind: "error"; job: Job | null; message: string; signIn?: boolean; short?: boolean };

const LABEL: Record<Tool, string> = { paraphrase: "Paraphrase", tone: "Change tone", shorten: "Shorten", expand: "Expand", clarity: "Clarity and flow" };
const coinsLabel = (n: number) => `${n} M coin${n === 1 ? "" : "s"}`;

/**
 * Rewrite with Claude for one editor: its menu's price, the consent (once
 * per paper), the request, and the card by the selection with the result.
 * Nothing is sent before a tool is chosen in a paper whose consent is
 * given; Replace is the only thing that changes the paper.
 */
export function useRewrite(target: () => RewriteTarget | null, opts: { dialect: Spelling["dialect"]; consented: boolean; onConsent: () => Promise<void>; enabled: boolean }) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [at, setAt] = useState({ left: 16, top: 96, above: 88 });
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const request = (t: RewriteTarget, sel: RewriteSelection, tool: Tool, tone: Tone | null) => {
    const coins = rewritePrice(rewriteWords(sel.passage));
    const dialect = optsRef.current.dialect === "off" ? "us" : optsRef.current.dialect;
    return { tool, tone, format: t.format, dialect, passage: sel.passage, coins } as const;
  };
  /** The selection's price, or why it can't be rewritten: for a menu. */
  const offer = (): RewriteOffer => {
    const t = target();
    if (!t || !optsRef.current.enabled) return "Rewrite isn't available in this tab.";
    const sel = t.read();
    if (typeof sel === "string") return sel;
    const req = request(t, sel, "paraphrase", null);
    const refused = parseRewriteRequest(req);
    return typeof refused === "string" ? refused : { words: rewriteWords(sel.passage), coins: req.coins };
  };
  const moveToSelection = () => {
    const a = target()?.anchor();
    if (a) setAt(a);
  };
  /** The tools by the selection (the Word editor's right-click item, the commands). */
  const openMenu = () => {
    moveToSelection();
    setStage({ kind: "menu", offer: offer() });
  };

  const send = async (job: Job) => {
    setStage({ kind: "running", job });
    try {
      const dialect = optsRef.current.dialect === "off" ? "us" : optsRef.current.dialect;
      const r = await requestRewrite({ tool: job.tool, tone: job.tone, format: job.format, dialect, passage: job.sel.passage, coins: job.coins });
      if (r.balance !== null) setBalance(r.balance);
      setStage({ kind: "done", job, text: r.text, notes: r.notes });
    } catch (err) {
      if (err instanceof NotEnoughCoinsError) {
        setBalance(err.balance);
        setStage({ kind: "error", job, message: err.message, short: true });
      } else if (err instanceof SignInRequiredError) {
        void refreshAccount();
        setStage({ kind: "error", job, message: "Sign in to use Rewrite.", signIn: true });
      } else setStage({ kind: "error", job, message: err instanceof Error ? err.message : "The rewrite failed. Try again in a moment." });
    }
  };

  /** A tool chosen: checked here, then the consent if this paper hasn't given it, then sent. */
  const run = (tool: Tool, tone: Tone | null) => {
    const t = target();
    if (!t || !optsRef.current.enabled) return;
    moveToSelection();
    const sel = t.read();
    if (typeof sel === "string") return setStage({ kind: "error", job: null, message: sel });
    const req = request(t, sel, tool, tone);
    const refused = parseRewriteRequest(req);
    if (typeof refused === "string") return setStage({ kind: "error", job: null, message: refused });
    const job: Job = { sel, format: t.format, tool, tone, coins: req.coins };
    if (currentAccount().status === "out") return setStage({ kind: "error", job, message: "Sign in to use Rewrite.", signIn: true });
    if (!optsRef.current.consented) return setStage({ kind: "consent", job });
    void send(job);
  };

  const close = () => setStage(null);
  const replace = (job: Job, text: string) => {
    if (job.sel.place(text) === "applied") close();
    else setStage({ kind: "stale", job, text });
  };
  const title = (job: Job) => `${LABEL[job.tool]}${job.tone ? `, ${job.tone}` : ""}`;

  const element = stage && (
    <RewriteCard left={at.left} top={at.top} above={at.above} onClose={close}>
      {stage.kind === "menu" && (
        <div role="menu" aria-label="Rewrite">
          <RewriteMenuItems offer={stage.offer} onTool={run} />
        </div>
      )}
      {stage.kind === "consent" && (
        <RewriteConsent
          onConfirm={() => {
            const job = stage.job;
            void optsRef.current.onConsent().then(() => send(job));
          }}
          onCancel={close}
        />
      )}
      {stage.kind === "running" && (
        <p aria-live="polite" className="text-ink-soft">
          {title(stage.job)}: Claude is rewriting the selection ({coinsLabel(stage.job.coins)})…
        </p>
      )}
      {stage.kind === "done" && (
        <>
          <p className="mb-2 text-xs text-ink-soft">Rewritten by AI (Claude): {title(stage.job)}. Read it before you use it.</p>
          <RewriteDiff before={stage.job.sel.before} after={stage.job.sel.show(stage.text)} />
          {stage.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-soft" aria-label="Notes">
              {stage.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => replace(stage.job, stage.text)} className="clay-btn clay-primary h-9 px-4 font-medium">
              Replace
            </button>
            <button type="button" onClick={() => void send(stage.job)} className="clay-btn h-9 px-4">
              Try again · {coinsLabel(stage.job.coins)}
            </button>
            <button type="button" onClick={close} className="h-9 px-3 text-ink-soft hover:text-ink">
              Discard
            </button>
          </div>
        </>
      )}
      {stage.kind === "stale" && (
        <>
          <p className="mb-2 text-ink">The text changed after you asked, so the rewrite wasn&apos;t put in. Copy it and place it yourself:</p>
          <RewriteDiff before={stage.job.sel.before} after={stage.job.sel.show(stage.text)} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(stage.job.sel.show(stage.text)).catch(() => {})} className="clay-btn h-9 px-4">
              Copy the rewrite
            </button>
            <button type="button" onClick={close} className="h-9 px-3 text-ink-soft hover:text-ink">
              Close
            </button>
          </div>
        </>
      )}
      {stage.kind === "error" && (
        <>
          <ErrorText>{stage.message}</ErrorText>
          {stage.short && (
            <p className="mt-2 text-ink-soft">
              <a href="/pricing#packs" target="_blank" rel="noopener" className="text-accent underline-offset-2 hover:underline">
                Buy coins
              </a>{" "}
              (opens in a new tab; your paper stays here)
            </p>
          )}
          {stage.signIn && (
            <div className="mt-3">
              <SignInPanel
                lead={
                  <p className="text-sm text-ink-soft">
                    Rewrite costs 1 M coin per {REWRITE_WORDS_PER_COIN} words. New accounts get {WELCOME_COINS} M coins.
                  </p>
                }
              />
            </div>
          )}
          <div className="mt-3">
            <button type="button" onClick={close} className="h-9 px-3 text-ink-soft hover:text-ink">
              Close
            </button>
          </div>
        </>
      )}
    </RewriteCard>
  );

  return { offer, run, openMenu, element, busy: stage?.kind === "running" };
}
