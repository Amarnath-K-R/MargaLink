"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Coin } from "@/components/account/AccountButton";
import SignInPanel from "@/components/account/SignInPanel";
import { ProStatus } from "../../pricing/_components/Packs";
import { PRO } from "@/lib/accounts/coins";
import { openPortal } from "@/lib/accounts/paddleCheckout";
import { refreshAccount, signOut, useAccount } from "@/components/account/useAccount";
import type { LedgerKind } from "@/lib/accounts/coins";
import { BETA } from "@/lib/access/beta";

type Details = { email: string; balance: number; google: boolean; since?: number; noticeVersion?: number; history: { kind: LedgerKind; label: string; delta: number; at: number }[] };
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

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
      .then((r) => (r.ok ? (r.json() as Promise<Details>) : Promise.reject(new Error("Couldn't load your account. Reload the page to try again."))))
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
          A review costs 4 to 45 M coins, by depth and length; Ask Claude costs 1. The price is always shown before anything is sent, and any part of
          a run that doesn&apos;t come back is refunded automatically. Pro coins are spent first and up to {PRO.carryCap} carry over each month; pack
          coins never expire.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/pricing#packs" className="clay-btn clay-primary h-10 px-5 text-sm font-medium">
            Buy coins
          </Link>
          {details?.history.some((h) => h.kind === "pack" || h.kind === "pro_grant") && <BillingButton />}
        </div>
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

      <Panel title="Pro">
        {account.pro ? (
          <ProStatus pro={account.pro} />
        ) : (
          <p>
            Pro adds {PRO.coinsPerMonth} M coins every month, billed monthly or yearly, and you can cancel any time.{" "}
            <Link href="/pricing#pro" className="text-accent hover:underline">
              See Pro
            </Link>
          </p>
        )}
      </Panel>

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
          We keep your email address, how you sign in, your M coin history, a 30-day log of your requests to our server (never what you sent) and,
          for a paid review in progress, which sections it covers (for two hours). Never anything from your papers.{" "}
          <Link href="/privacy#accounts" className="text-accent hover:underline">
            The full list
          </Link>
        </p>
        {details?.since && (
          <p className="mt-2">
            You confirmed you&apos;re 18 or older and agreed to the terms and privacy notice (version {details.noticeVersion ?? 1}) on {day(details.since)}.
          </p>
        )}
        <a href="/api/account?download=1" download className="clay-btn mt-4 h-10 px-5 text-sm">
          <Download size={15} strokeWidth={2} /> Download my data
        </a>
      </Panel>

      <DeletePanel email={account.email} coins={account.balance} pro={!!account.pro && account.pro.status !== "canceled"} tester={BETA.on && !account.developer} onDeleted={() => setDeleted(true)} />
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

// Paddle's customer portal: receipts, refunds (its 14-day withdrawal button) and Pro.
function BillingButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => void openPortal().then(setError)} className="clay-btn h-10 px-5 text-sm">
        Receipts, refunds and billing (Paddle)
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-away">
          {error}
        </p>
      )}
    </>
  );
}

function DeletePanel({ email, coins, pro, tester, onDeleted }: { email: string; coins: number; pro: boolean; tester: boolean; onDeleted: () => void }) {
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
      <p>
        This deletes your email address, sign-ins and coin history straight away, and it can&apos;t be undone.{" "}
        {coins > 0 && (
          <>
            <strong>You&apos;ll lose your {coins} M coin{coins === 1 ? "" : "s"}</strong>, and coins can&apos;t be refunded after deletion: if you bought a
            pack in the last 14 days, ask for its refund first.{" "}
          </>
        )}
        We keep a keyed fingerprint of your email address for 12 months, so the welcome bonus isn&apos;t given to it again; it can&apos;t be turned back
        into your address.
        {tester && " It also takes you off the beta list, so you can't sign back in unless you're invited again."}
      </p>
      {pro && (
        <p className="mt-2 text-away">
          It also ends Pro at once: the rest of the period you&apos;ve paid for is lost. To keep it until then, use Cancel or manage Pro instead and
          delete your account after it ends.
        </p>
      )}
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
