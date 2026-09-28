"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { WELCOME_COINS } from "@/lib/coins";
import { signInWithGoogle } from "./useAccount";

// Sign in without leaving the page: Google in a popup, or a one-time link
// by email (it opens in a new tab). Either way this tab notices on focus, so
// a loaded paper, dataset or figure is never lost. Used by /signin, the
// tray's Sign in button, and the review and figure consents. Where
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, the email form carries Cloudflare
// Turnstile's check (its script loads only then).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
// `notice`: a problem from an earlier attempt, shown until the next one.
// `fullPage`: on the sign-in page itself, where a blocked popup can fall
// back to a redirect (elsewhere that would lose whatever the page holds).
export default function SignInPanel({ next, lead, notice, fullPage = false }: { next?: string; lead?: ReactNode; notice?: string; fullPage?: boolean }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [human, setHuman] = useState<string | null>(null); // Turnstile's token, when it's on
  const [attempt, setAttempt] = useState(0); // a token works once: a new attempt gets a new check
  const target = () => next ?? `${location.pathname}${location.search}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: target(), ...(TURNSTILE_SITE_KEY ? { turnstile: human } : {}) }),
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Something went wrong (${res.status}). Try again.`);
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
      setHuman(null);
      setAttempt((a) => a + 1);
    }
  }

  if (phase === "sent") {
    return (
      <div aria-live="polite">
        <p className="flex items-center gap-2 font-serif text-lg font-medium">
          <span aria-hidden className="bead" style={{ background: "#dde6e6" }}>
            <Mail size={13} strokeWidth={2} />
          </span>
          Check your email
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We sent a sign-in link to <strong className="font-medium text-ink">{email}</strong>. It works once, within 15 minutes, and opens in a new tab. This page stays as
          it is and picks up the sign-in when you come back to it.
        </p>
        <button type="button" onClick={() => setPhase("idle")} className="mt-3 text-sm text-accent hover:underline">
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div>
      {notice && !tried && (
        <p role="alert" className="mb-4 rounded-xl bg-[#f6e7df] px-3 py-2 text-sm text-away">
          {notice}
        </p>
      )}
      {lead ?? <p className="text-sm leading-relaxed text-ink-soft">AI reviews and Ask Claude need an account. New accounts get {WELCOME_COINS} M coins.</p>}
      <button
        type="button"
        onClick={() => {
          setTried(true);
          setError(null);
          if (!signInWithGoogle(target(), { redirectIfBlocked: fullPage }) && !fullPage) {
            setError("Your browser blocked the Google window. Allow pop-ups for this site and try again, or use an email link below.");
          }
        }}
        className="clay-btn mt-4 h-11 w-full justify-center gap-2.5 text-sm font-medium"
      >
        <GoogleMark /> Continue with Google
      </button>
      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <label htmlFor="signin-email" className="text-xs font-medium text-ink-soft">
          Email me a sign-in link
        </label>
        <input
          id="signin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@university.edu"
          className="clay-input h-11 text-sm"
        />
        {TURNSTILE_SITE_KEY && <Turnstile key={attempt} siteKey={TURNSTILE_SITE_KEY} onToken={setHuman} />}
        <button type="submit" disabled={phase === "sending" || (!!TURNSTILE_SITE_KEY && !human)} className="clay-btn clay-primary h-11 justify-center text-sm font-medium">
          {phase === "sending" ? "Sending…" : "Send the link"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-away">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        We keep only your email address, never anything from your papers.{" "}
        <Link href="/privacy#accounts" className="text-accent hover:underline">
          What an account stores
        </Link>
      </p>
    </div>
  );
}

type TurnstileJs = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
let turnstileLoading: Promise<TurnstileJs> | null = null;
function loadTurnstile(): Promise<TurnstileJs> {
  turnstileLoading ??= new Promise<TurnstileJs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      const ts = (window as unknown as { turnstile?: TurnstileJs }).turnstile;
      if (ts) resolve(ts);
      else reject(new Error("Turnstile didn't load"));
    };
    s.onerror = () => {
      turnstileLoading = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return turnstileLoading;
}

// Cloudflare's check that a person, not a script, is asking for a link.
function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return;
        id = ts.render(box.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(null), "error-callback": () => onToken(null) });
      })
      .catch(() => onToken(null));
    return () => {
      gone = true;
      if (id) (window as unknown as { turnstile?: TurnstileJs }).turnstile?.remove(id);
    };
  }, [siteKey, onToken]);
  return <div ref={box} className="min-h-[65px]" />;
}

// Google's "G", in its own colours (their sign-in branding asks for it).
function GoogleMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
