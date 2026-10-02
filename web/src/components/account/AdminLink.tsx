"use client";

import Link from "next/link";
import { Gauge } from "lucide-react";
import { useAccount } from "./useAccount";

// The tray's link to the developer console, for developers only (the page
// and its API check again on the server).
export default function AdminLink({ current }: { current: boolean }) {
  const account = useAccount();
  if (account.status !== "in" || !account.developer) return null;
  return (
    <Link href="/admin" aria-current={current ? "page" : undefined} className="clay-ghost shrink-0 px-1.5 text-xs text-ink-soft sm:px-3">
      <Gauge size={15} strokeWidth={1.9} className="sm:hidden" />
      <span className="sr-only sm:not-sr-only">Admin</span>
    </Link>
  );
}
