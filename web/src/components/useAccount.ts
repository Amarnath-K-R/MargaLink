"use client";

import { useSyncExternalStore } from "react";

// Who is signed in, and their M coin balance: one store for the whole page.
// Signed-out visitors make no request at all: /api/me is only asked when
// the ml_in hint cookie (set beside the HttpOnly session) says someone is
// signed in. It's asked again when the tab regains focus, which is how a
// sign-in finished in a popup or another tab reaches this one.
// `paddle`: what Paddle.js needs to open a checkout, or null until payments are set up.
export type PaddleConfig = { env: "sandbox" | "production"; token: string; prices: Record<string, string> };
// `pro`: the Pro plan, if there is one (renews: false once cancelled to the period's end).
export type ProPlan = { interval: "month" | "year"; status: string; renews: boolean; periodEnd: number | null };
export type Account =
  | { status: "unknown" }
  | { status: "out" }
  | { status: "in"; id: string; email: string; balance: number; pro: ProPlan | null; paddle: PaddleConfig | null };

const SERVER: Account = { status: "unknown" };
let state: Account = SERVER;
const listeners = new Set<() => void>();
const set = (next: Account) => {
  state = next;
  for (const l of listeners) l();
};
const hinted = () => /(?:^|;\s*)ml_in=1(?:;|$)/.test(document.cookie);

async function load() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) throw new Error(String(res.status));
    const d = (await res.json()) as { user: { id: string; email: string } | null; balance?: number; pro?: ProPlan | null; paddle?: PaddleConfig | null };
    set(d.user ? { status: "in", id: d.user.id, email: d.user.email, balance: d.balance ?? 0, pro: d.pro ?? null, paddle: d.paddle ?? null } : { status: "out" });
  } catch {
    // Offline or a server hiccup: keep what we knew; if we knew nothing, show signed out.
    if (state.status === "unknown") set({ status: "out" });
  }
}

let inflight: Promise<void> | null = null;
export function refreshAccount(): Promise<void> {
  if (!hinted()) {
    if (state.status !== "out") set({ status: "out" });
    return Promise.resolve();
  }
  if (!inflight) inflight = load().finally(() => (inflight = null));
  return inflight;
}

const onFocus = () => document.visibilityState === "visible" && void refreshAccount();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    if (state.status === "unknown") void refreshAccount();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    }
  };
}

export const useAccount = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

/** The store's value right now, for code outside React (waiting for a purchase to land). */
export const currentAccount = () => state;

/** After a charge, the server's new balance. */
export function setBalance(balance: number) {
  if (state.status === "in") set({ ...state, balance });
}

export async function signOut(everywhere = false) {
  await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: everywhere }) });
  set({ status: "out" });
}

/**
 * Google sign-in in a popup, so the page (and a loaded paper) stays as it
 * is. A blocked popup falls back to a full-page redirect.
 */
export function signInWithGoogle(next: string) {
  const url = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
  const w = window.open(`${url}&popup=1`, "margalink-signin", "popup,width=480,height=640");
  if (!w) {
    location.assign(new URL(url, location.origin).href); // an API route, not a page
    return;
  }
  const timer = setInterval(() => {
    if (!w.closed) return;
    clearInterval(timer);
    void refreshAccount();
  }, 500);
}
