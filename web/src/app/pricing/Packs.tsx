"use client";

import { useState } from "react";
import Link from "next/link";
import { Coin } from "@/components/AccountButton";
import { currentAccount, refreshAccount, useAccount } from "@/components/useAccount";
import { PACKS, reviewPrice, type PackId } from "@/lib/coins";
import { openCheckout } from "@/lib/paddleCheckout";

type Status = { pack: PackId; phase: "opening" | "adding" | "added" | "slow" } | { pack: PackId; phase: "error"; message: string };

// The three packs, and buying one: Paddle's checkout opens over the page;
// when it says the payment went through, we wait for the webhook to add the
// coins (usually a few seconds) and say so.
export default function Packs() {
  const account = useAccount();
  const [status, setStatus] = useState<Status | null>(null);

  async function waitForCoins(pack: PackId, before: number) {
    setStatus({ pack, phase: "adding" });
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshAccount();
      const now = currentAccount();
      if (now.status === "in" && now.balance > before) return setStatus({ pack, phase: "added" });
    }
    setStatus({ pack, phase: "slow" });
  }

  async function buy(pack: PackId) {
    if (account.status !== "in" || !account.paddle?.prices[pack]) return;
    setStatus({ pack, phase: "opening" });
    const before = account.balance;
    try {
      await openCheckout({
        env: account.paddle.env,
        token: account.paddle.token,
        priceId: account.paddle.prices[pack],
        email: account.email,
        userId: account.id,
        onCompleted: () => void waitForCoins(pack, before),
      });
      setStatus((s) => (s?.phase === "opening" ? null : s));
    } catch (err) {
      setStatus({ pack, phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const perReview = reviewPrice("standard", 50_000);
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {PACKS.map((p) => {
        const mine = status?.pack === p.id ? status : null;
        return (
          <div key={p.id} className="sheet flex flex-col p-6" data-pack={p.id}>
            <p className="flex items-center gap-2 font-serif text-2xl font-medium tabular-nums">
              <Coin className="h-7 w-7 text-sm" />
              {p.coins} M coins
            </p>
            <p className="mt-4 font-serif text-4xl font-medium">${p.usd}</p>
            <p className="mt-1 text-sm text-ink-soft">₹{p.inr.toLocaleString("en-IN")} in India</p>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-soft">
              About {Math.floor(p.coins / perReview)} standard reviews of a typical paper, or {p.coins} Ask Claude requests.
            </p>
            <div className="mt-5" aria-live="polite">
              {account.status === "in" ? (
                <button
                  type="button"
                  onClick={() => void buy(p.id)}
                  disabled={!account.paddle?.prices[p.id] || (!!status && status.phase !== "error" && status.phase !== "added" && status.phase !== "slow")}
                  className="clay-btn clay-primary h-11 w-full justify-center text-sm font-medium"
                >
                  {mine?.phase === "opening" ? "Opening checkout…" : mine?.phase === "adding" ? "Adding your coins…" : `Buy ${p.coins} M coins`}
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
          </div>
        );
      })}
    </div>
  );
}
