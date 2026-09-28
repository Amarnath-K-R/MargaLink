"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { refreshAccount } from "@/components/useAccount";

// Where the emailed link lands: /signin/verify#t=<token>&e=<address>. The
// token is in the #fragment, which browsers never send to a server, and
// nothing is spent until the person confirms here, so a mail scanner that
// opens the link can't use it up.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export default function VerifyView() {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  const link = new URLSearchParams(hash.slice(1));
  const [phase, setPhase] = useState<"ask" | "working" | "done">("ask");
  const [email, setEmail] = useState("");
  const [next, setNext] = useState("/home");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPhase("working");
    setError(null);
    setEmail(link.get("e") ?? "");
    try {
      const res = await fetch("/api/auth/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: link.get("t") }) });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Signing in didn't work (${res.status}).`);
      setNext(((await res.json()) as { next: string }).next);
      history.replaceState(null, "", location.pathname); // the spent token leaves the address bar
      setPhase("done");
      void refreshAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("ask");
    }
  }

  if (phase === "done") {
    return (
      <div className="sheet p-6 sm:p-8" aria-live="polite">
        <p className="font-serif text-xl font-medium">You&apos;re signed in{email ? ` as ${email}` : ""}.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          If you started in another tab, go back to it: it picks up the sign-in, and your work there is just as you left it.
        </p>
        <Link href={next} className="clay-btn clay-primary mt-5 h-10 px-5 text-sm font-medium">
          Continue here <ArrowRight size={15} strokeWidth={2} />
        </Link>
      </div>
    );
  }
  if (!hash) return null; // before the fragment is read
  if (!link.get("t")) {
    return (
      <div className="sheet p-6 sm:p-8">
        <p className="font-serif text-xl font-medium">This link is incomplete.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">Open it from your email again, or ask for a new one.</p>
        <Link href="/signin" className="clay-btn mt-5 h-10 px-5 text-sm">
          Get a new link
        </Link>
      </div>
    );
  }
  return (
    <div className="sheet max-w-md p-6 sm:p-8">
      <p className="font-serif text-xl font-medium">Sign in as {link.get("e") ?? "this address"}?</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">This link works once. Signing in here also signs in any other MargaLink tab in this browser.</p>
      <button type="button" onClick={() => void confirm()} disabled={phase === "working"} className="clay-btn clay-primary mt-5 h-11 px-6 text-sm font-medium">
        {phase === "working" ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <div role="alert" className="mt-4 text-sm text-away">
          {error}{" "}
          <Link href="/signin" className="text-accent hover:underline">
            Ask for a new link
          </Link>
        </div>
      )}
    </div>
  );
}
