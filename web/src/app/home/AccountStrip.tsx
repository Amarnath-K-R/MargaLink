"use client";

import Link from "next/link";
import { WELCOME_COINS } from "@/lib/coins";
import { Coin } from "@/components/AccountButton";
import { useAccount } from "@/components/useAccount";

// Home's account line, beside the heading: the balance and the way to the
// account page, or an invitation to sign in (only the AI features need it).
export default function AccountStrip() {
  const account = useAccount();
  if (account.status === "unknown") return null;
  return (
    <div className="clay-well flex items-center gap-3 rounded-2xl px-4 py-2.5 text-xs md:ml-auto">
      {account.status === "in" ? (
        <>
          <Coin />
          <span className="tabular-nums">
            <strong className="font-medium">{account.balance}</strong> M coins
          </span>
          <span aria-hidden className="h-4 w-px bg-line" />
          <Link href="/account" className="text-accent hover:underline">
            Account
          </Link>
        </>
      ) : (
        <>
          <span className="leading-snug text-ink-soft">
            For AI reviews and Ask Claude.
            <br />
            New accounts get {WELCOME_COINS} M coins.
          </span>
          <Link href="/signin?next=/home" className="clay-btn h-8 shrink-0 px-4 text-xs font-medium">
            Sign in
          </Link>
        </>
      )}
    </div>
  );
}
