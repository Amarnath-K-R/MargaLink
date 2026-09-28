"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Coin } from "@/components/AccountButton";
import SignInPanel from "@/components/SignInPanel";
import { refreshAccount, signOut, useAccount } from "@/components/useAccount";
import type { LedgerKind } from "@/lib/coins";

type Details = { email: string; balance: number; google: boolean; history: { kind: LedgerKind; label: string; delta: number; at: number }[] };

// The account page: the balance and every coin in or out, how you sign in,
// signing out (here or everywhere), a copy of everything we hold, and
// deleting it all. Only the account's own data: nothing from a paper exists
// on the server to show.
export default function AccountView() {
  const account = useAccount();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const signedIn = account.status === "in";
  const balance = account.status === "in" ? account.balance : null;

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch("/api/account")
      .then((r) => (r.ok ? (r.json() as Promise<Details>) : Promise.reject(new Error(`Couldn't load your account (${r.status}).`))))
      .then((d) => live && setDetails(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [signedIn, balance]);

  if (deleted) {
    return (
      <div className="sheet p-6 sm:p-8" aria-live="polite">
        <p className="font-serif text-xl font-medium">Your account is deleted.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">Its email address, sign-ins and M coins are gone. Every tool that doesn&apos;t need an account still works as before.</p>
      </div>
    );
  }
  if (account.status === "unknown") return null;
  if (account.status === "out") {
    return (
      <div className="sheet max-w-md p-6 sm:p-8">
        <p className="mb-1 font-serif text-xl font-medium">Sign in to see your account</p>
        <SignInPanel next="/account" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <section aria-labelledby="coins" className="sheet p-6 sm:p-8">
        <h2 id="coins" className="text-xs font-medium text-accent">
          M coins
        </h2>
        <p className="mt-2 flex items-center gap-3 font-serif text-4xl font-medium tabular-nums">
          <Coin className="h-9 w-9 text-lg" />
          {account.balance}
        </p>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-soft">
          A review costs 4 to 45 M coins, by depth and length; Ask Claude costs 1. The price is always shown before anything is sent, and a run that
          doesn&apos;t finish is refunded automatically.
        </p>
        <h3 className="mt-7 text-xs font-medium text-ink-soft">History</h3>
        {error && <p className="mt-2 text-sm text-away">{error}</p>}
        {details && details.history.length === 0 && <p className="mt-2 text-sm text-ink-soft">No coin activity yet.</p>}
        {details && details.history.length > 0 && (
          <ol className="mt-2 divide-y divide-line/70 text-sm">
            {details.history.map((h, i) => (
              <li key={i} className="flex items-baseline gap-4 py-2.5">
                <span className="w-24 shrink-0 text-xs text-ink-soft tabular-nums">{new Date(h.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="min-w-0 flex-1">{h.label}</span>
                <span className={`shrink-0 font-medium tabular-nums ${h.delta > 0 ? "text-accent" : "text-ink"}`}>
                  {h.delta > 0 ? `+${h.delta}` : `−${-h.delta}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Panel title="Signing in">
        <p>
          Signed in as <strong>{account.email}</strong>
          {details ? (details.google ? ", with Google or an email link." : ", with an email link.") : "."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => void signOut()} className="clay-btn h-10 px-5 text-sm">
            Sign out
          </button>
          <button type="button" onClick={() => void signOut(true)} className="clay-btn h-10 px-5 text-sm">
            Sign out everywhere
          </button>
        </div>
      </Panel>

      <Panel title="Your data">
        <p>
          We keep your email address, how you sign in, your M coin history and, for a paid review in progress, which sections it covers (for two hours).
          Never anything from your papers.{" "}
          <Link href="/privacy#accounts" className="text-accent hover:underline">
            The full list
          </Link>
        </p>
        <a href="/api/account?download=1" download className="clay-btn mt-4 h-10 px-5 text-sm">
          <Download size={15} strokeWidth={2} /> Download my data
        </a>
      </Panel>

      <DeletePanel email={account.email} onDeleted={() => setDeleted(true)} />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sheet p-6 text-sm leading-relaxed text-ink-soft sm:p-8 [&_strong]:font-medium [&_strong]:text-ink">
      <h2 className="mb-2 font-serif text-lg font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function DeletePanel({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email;
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: typed }) });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Deleting didn't work (${res.status}).`);
      onDeleted();
      void refreshAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }
  return (
    <section className="sheet border-l-4 border-away p-6 text-sm leading-relaxed text-ink-soft sm:p-8">
      <h2 className="mb-2 font-serif text-lg font-medium text-ink">Delete your account</h2>
      <p>This deletes your email address, sign-ins and coin history straight away. Any M coins left are lost, and it can&apos;t be undone.</p>
      <label htmlFor="delete-confirm" className="mt-4 block text-xs font-medium">
        Type {email} to confirm
      </label>
      <div className="mt-1.5 flex flex-wrap gap-3">
        <input id="delete-confirm" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="clay-input h-10 min-w-0 flex-1 text-sm" />
        <button type="button" disabled={!matches || busy} onClick={() => void remove()} className="clay-btn h-10 px-5 text-sm font-medium text-away disabled:opacity-50">
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-away">
          {error}
        </p>
      )}
    </section>
  );
}
