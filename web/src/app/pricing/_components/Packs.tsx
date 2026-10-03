"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Coin } from "@/components/account/AccountButton";
import { currentAccount, refreshAccount, useAccount } from "@/components/account/useAccount";
import { PACKS, PRO, REWRITE_WORDS_PER_COIN, reviewPrice } from "@/lib/accounts/coins";
import { openCheckout, openPortal } from "@/lib/accounts/paddleCheckout";
import NewTabLink from "@/components/ui/NewTabLink";

// What can be bought, by its key in PADDLE_PRICE_IDS.
type Key = (typeof PACKS)[number]["id"] | "PRO_MONTH" | "PRO_YEAR";
type Status = { key: Key; phase: "opening" | "adding" | "added" | "slow" } | { key: Key; phase: "error"; message: string };
const perReview = reviewPrice("standard", 50_000);

// Buying: Paddle's checkout opens over the page; when it says the payment
// went through, we wait for the webhook to add the coins (usually a few
// seconds) and say so. Pro's first month arrives the same way. Nothing opens
// until the buyer ticks the (unticked) box accepting the terms and the
// refund policy, and for Pro, that it renews until cancelled.
function useCheckout() {
  const account = useAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [agreed, setAgreed] = useState(false);

  async function waitForCoins(key: Key, before: number) {
    setStatus({ key, phase: "adding" });
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshAccount();
      const now = currentAccount();
      if (now.status === "in" && now.balance > before) return setStatus({ key, phase: "added" });
    }
    setStatus({ key, phase: "slow" });
  }

  async function buy(key: Key) {
    if (account.status !== "in" || !account.paddle?.prices[key]) return;
    setStatus({ key, phase: "opening" });
    const before = account.balance;
    try {
      await openCheckout({
        env: account.paddle.env,
        token: account.paddle.token,
        priceId: account.paddle.prices[key],
        email: account.email,
        userId: account.id,
        sig: account.paddle.checkout,
        onCompleted: () => void waitForCoins(key, before),
      });
      setStatus((s) => (s?.phase === "opening" ? null : s));
    } catch (err) {
      setStatus({ key, phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }
  const busy = !!status && (status.phase === "opening" || status.phase === "adding");
  return { account, status, buy, busy, agreed, setAgreed };
}


function AgreeBox({ c, pro = false }: { c: ReturnType<typeof useCheckout>; pro?: boolean }) {
  if (c.account.status !== "in") return null;
  return (
    <label className="mt-4 flex items-start gap-2 text-sm text-ink-soft">
      <input type="checkbox" checked={c.agreed} onChange={(e) => c.setAgreed(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
      <span>
        I agree to the <NewTabLink href="/terms">terms</NewTabLink> and the <NewTabLink href="/refunds">refund policy</NewTabLink>
        {pro ? ", and I understand Pro renews automatically at the price shown until I cancel it." : "."}
      </span>
    </label>
  );
}

function BuyButton({ k, label, c }: { k: Key; label: string; c: ReturnType<typeof useCheckout> }) {
  const { account, status, buy, busy, agreed } = c;
  const mine = status?.key === k ? status : null;
  return (
    <div aria-live="polite">
      {account.status === "in" ? (
        <button type="button" onClick={() => void buy(k)} disabled={!account.paddle?.prices[k] || busy || !agreed} className="clay-btn clay-primary h-11 w-full justify-center text-sm font-medium">
          {mine?.phase === "opening" ? "Opening checkout…" : mine?.phase === "adding" ? "Adding your coins…" : label}
        </button>
      ) : (
        <Link href="/signin?next=/pricing" className="clay-btn h-11 w-full justify-center text-sm font-medium">
          Sign in to buy
        </Link>
      )}
      {account.status === "in" && !account.paddle && <p className="mt-2 text-xs text-ink-soft">Buying coins opens soon.</p>}
      {mine?.phase === "added" && <p className="mt-2 text-sm text-accent">Added. You now have {account.status === "in" ? account.balance : ""} M coins.</p>}
      {mine?.phase === "slow" && (
        <p className="mt-2 text-sm text-ink-soft">
          Payment received. Your coins will appear within a minute; check{" "}
          <Link href="/account" className="text-accent hover:underline">
            your account
          </Link>
          .
        </p>
      )}
      {mine?.phase === "error" && (
        <p role="alert" className="mt-2 text-sm text-away">
          {mine.message}
        </p>
      )}
    </div>
  );
}

export function Packs() {
  const c = useCheckout();
  return (
    <>
    <AgreeBox c={c} />
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {PACKS.map((p) => (
        <div key={p.id} className="sheet flex flex-col p-6" data-pack={p.id}>
          <p className="flex items-center gap-2 font-serif text-2xl font-medium tabular-nums">
            <Coin className="h-7 w-7 text-sm" />
            {p.coins} M coins
          </p>
          <p className="mt-4 font-serif text-4xl font-medium">${p.usd}</p>
          <p className="mt-1 text-sm text-ink-soft">₹{p.inr.toLocaleString("en-IN")} in India</p>
          <p className="mt-4 mb-5 flex-1 text-sm leading-relaxed text-ink-soft">
            About {Math.floor(p.coins / perReview)} standard reviews of a typical paper, {p.coins} Ask Claude requests, or {p.coins} rewrites of up
            to {REWRITE_WORDS_PER_COIN} words.
          </p>
          <BuyButton k={p.id} label={`Buy ${p.coins} M coins`} c={c} />
        </div>
      ))}
    </div>
    </>
  );
}

export function ProPlans() {
  const c = useCheckout();
  const pro = c.account.status === "in" ? c.account.pro : null;
  return (
    <div className="sheet mt-5 grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" data-testid="pro">
      <div>
        <p className="flex items-center gap-2 font-serif text-2xl font-medium">
          <Coin className="h-7 w-7 text-sm" />
          {PRO.coinsPerMonth} M coins every month
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          About {Math.floor(PRO.coinsPerMonth / perReview)} standard reviews a month. Unspent Pro coins carry over, up to {PRO.carryCap}.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Pro renews automatically every month or every year, at the price shown, until you cancel. You can cancel at any time on your account page;
          your plan runs to the end of the period you paid for.
        </p>
        {!pro && <AgreeBox c={c} pro />}
      </div>
      {pro ? (
        <ProStatus pro={pro} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Plan title="Monthly" price={`$${PRO.month.usd}`} per="a month" inr={`₹${PRO.month.inr.toLocaleString("en-IN")} a month in India`}>
            <BuyButton k="PRO_MONTH" label="Get Pro monthly" c={c} />
          </Plan>
          <Plan title="Yearly" price={`$${PRO.year.usd}`} per="a year" inr={`₹${PRO.year.inr.toLocaleString("en-IN")} a year in India`} note="Two months free">
            <BuyButton k="PRO_YEAR" label="Get Pro yearly" c={c} />
          </Plan>
        </div>
      )}
    </div>
  );
}

function Plan({ title, price, per, inr, note, children }: { title: string; price: string; per: string; inr: string; note?: string; children: ReactNode }) {
  return (
    <div className="clay-well flex flex-col rounded-2xl p-5">
      <p className="text-xs font-medium text-accent">
        {title}
        {note && <span className="ml-2 text-ink-soft">{note}</span>}
      </p>
      <p className="mt-2 font-serif text-3xl font-medium">
        {price} <span className="text-base font-normal text-ink-soft">{per}</span>
      </p>
      <p className="mt-1 mb-4 flex-1 text-xs text-ink-soft">{inr}</p>
      {children}
    </div>
  );
}

/** The plan you have: when it renews or ends, and the way to manage it. Shared with /account. */
export function ProStatus({ pro }: { pro: NonNullable<Extract<ReturnType<typeof useAccount>, { status: "in" }>["pro"]> }) {
  const [error, setError] = useState<string | null>(null);
  const date = pro.periodEnd ? new Date(pro.periodEnd).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  const line =
    pro.status === "past_due"
      ? "Your last payment didn't go through. Update your card to keep your monthly coins coming."
      : pro.status === "paused"
        ? "Pro is paused."
        : pro.renews
          ? `Renews automatically${date ? ` on ${date}` : ""} at ${pro.interval === "year" ? `$${PRO.year.usd} a year (₹${PRO.year.inr.toLocaleString("en-IN")} in India)` : `$${PRO.month.usd} a month (₹${PRO.month.inr.toLocaleString("en-IN")} in India)`}, until you cancel.`
          : `Cancelled: it ends${date ? ` on ${date}` : " at the end of this period"}.`;
  return (
    <div className="clay-well rounded-2xl p-5 text-sm">
      <p className="font-medium text-ink">You have Pro, {pro.interval === "year" ? "yearly" : "monthly"}.</p>
      <p className={`mt-1 ${pro.status === "past_due" ? "text-away" : "text-ink-soft"}`}>{line}</p>
      <button type="button" onClick={() => void openPortal().then(setError)} className="clay-btn mt-4 h-10 px-5 text-sm">
        Cancel or manage Pro
      </button>
      {error && (
        <p role="alert" className="mt-2 text-away">
          {error}
        </p>
      )}
    </div>
  );
}
