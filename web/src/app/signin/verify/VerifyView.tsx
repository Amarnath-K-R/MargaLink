"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { refreshAccount } from "@/components/useAccount";

// Where the emailed link lands: /signin/verify#t=<token>. The token is in
// the #fragment, which browsers never send to a server, and nothing is spent
// until the person confirms here, so a mail scanner that opens the link
// can't use it up. The address shown is the one the server has for the
// link (asked without spending it), never something the link itself says.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

type Phase = { at: "reading" } | { at: "ask"; email: string } | { at: "working"; email: string } | { at: "done"; email: string; next: string } | { at: "gone"; message: string };

export default function VerifyView() {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  const token = new URLSearchParams(hash.slice(1)).get("t");
  const [phase, setPhase] = useState<Phase>({ at: "reading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/auth/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, peek: true }) })
      .then(async (res) => {
        if (!live) return;
        if (res.ok) setPhase({ at: "ask", email: ((await res.json()) as { email: string }).email });
        else setPhase({ at: "gone", message: (await res.text().catch(() => "")) || "This sign-in link has expired or was already used." });
      })
      .catch(() => live && setPhase({ at: "gone", message: "We couldn't check this link. Check your connection and reload the page." }));
    return () => {
      live = false;
    };
  }, [token]);

  async function confirm(email: string) {
    setPhase({ at: "working", email });
    setError(null);
    try {
      const res = await fetch("/api/auth/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Signing in didn't work (${res.status}).`);
      const done = (await res.json()) as { next: string; email: string };
      history.replaceState(null, "", location.pathname); // the spent token leaves the address bar
      setPhase({ at: "done", email: done.email, next: done.next });
      void refreshAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase({ at: "ask", email });
    }
  }

  if (phase.at === "done") {
    return (
      <div className="sheet p-6 sm:p-8" aria-live="polite">
        <p className="font-serif text-xl font-medium">You&apos;re signed in as {phase.email}.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          If you started in another tab, go back to it: it picks up the sign-in, and your work there is just as you left it.
        </p>
        <Link href={phase.next} className="clay-btn clay-primary mt-5 h-10 px-5 text-sm font-medium">
          Continue here <ArrowRight size={15} strokeWidth={2} />
        </Link>
      </div>
    );
  }
  if (!hash) return null; // before the fragment is read
  if (!token || phase.at === "gone") {
    return (
      <div className="sheet p-6 sm:p-8">
        <p className="font-serif text-xl font-medium">{token ? "This link can't be used." : "This link is incomplete."}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{phase.at === "gone" ? phase.message : "Open it from your email again, or ask for a new one."}</p>
        <Link href="/signin" className="clay-btn mt-5 h-10 px-5 text-sm">
          Get a new link
        </Link>
      </div>
    );
  }
  if (phase.at === "reading") return <p className="text-sm text-ink-soft">Checking your link…</p>;
  return (
    <div className="sheet max-w-md p-6 sm:p-8">
      <p className="font-serif text-xl font-medium">Sign in as {phase.email}?</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">This link works once. Signing in here also signs in any other MargaLink tab in this browser.</p>
      <button type="button" onClick={() => void confirm(phase.email)} disabled={phase.at === "working"} className="clay-btn clay-primary mt-5 h-11 px-6 text-sm font-medium">
        {phase.at === "working" ? "Signing in…" : "Sign in"}
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
