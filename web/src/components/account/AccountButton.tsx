"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import SignInPanel from "./SignInPanel";
import { useAccount } from "./useAccount";

/** An M coin, as used wherever a price or balance is shown. */
export function Coin({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`coin font-serif ${className}`}>
      M
    </span>
  );
}

// The account corner of the tray: the M coin balance (to the account page)
// when signed in, a Sign in button (a small panel, so the page stays put)
// when not. Nothing until we know which, so the tray doesn't flicker.
export default function AccountButton({ variant = "tray" }: { variant?: "tray" | "landing" }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (account.status === "unknown") return null;
  if (account.status === "in") {
    return (
      <Link
        href="/account"
        aria-label={`${account.balance} M coins. Your account`}
        className={variant === "landing" ? "header-coins" : "clay-chip h-9 shrink-0 gap-1.5 pl-1.5 pr-3 text-xs font-medium tabular-nums"}
      >
        <Coin />
        <span>{account.balance}</span>
      </Link>
    );
  }
  if (variant === "landing") {
    return (
      <Link href="/signin?next=/home" className="header-signin">
        Sign in
      </Link>
    );
  }
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="clay-ghost px-1.5 text-xs text-ink-soft sm:px-3">
        <LogIn size={15} strokeWidth={1.9} className="sm:hidden" />
        <span className="sr-only sm:not-sr-only">Sign in</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Sign in" className="clay absolute right-0 top-12 z-40 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl p-5">
          <p className="mb-1 font-serif text-lg font-medium">Sign in</p>
          <SignInPanel />
        </div>
      )}
    </div>
  );
}
