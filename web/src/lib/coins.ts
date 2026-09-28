// M coins: what the AI features cost, what coins cost, and the small pure
// rules around them. Shared by the browser (to show a price before
// anything is sent) and the Functions (which charge it), so the two can't
// disagree. Prices here must match the Paddle dashboard and /pricing.
import type { ReviewTier } from "./reviewTypes.ts";

export const WELCOME_COINS = 10;
export const FIGURE_PRICE = 1;
// A paid review run stays usable (Resume, Retry) this long; if it hasn't
// finished by then, its coins come back.
export const REVIEW_TICKET_TTL_MS = 2 * 60 * 60 * 1000;

// [coins for the first 50,000 characters, coins for each further 50,000]
const REVIEW_PRICE: Record<ReviewTier, [number, number]> = { quick: [4, 2], standard: [6, 3], thorough: [10, 5] };
const PRICE_STEP = 50_000;

/** The price of a review of `chars` characters (what will actually be sent). */
export function reviewPrice(tier: ReviewTier, chars: number): number {
  const [base, step] = REVIEW_PRICE[tier];
  return base + step * Math.ceil(Math.max(0, chars - PRICE_STEP) / PRICE_STEP);
}

export const PACKS = [
  { id: "S", coins: 50, usd: 6, inr: 499 },
  { id: "M", coins: 150, usd: 15, inr: 1249 },
  { id: "L", coins: 400, usd: 36, inr: 2999 },
] as const;
export type PackId = (typeof PACKS)[number]["id"];

export const PRO = {
  coinsPerMonth: 100,
  carryCap: 100, // unspent Pro coins kept into the next month; the rest lapse
  month: { usd: 9, inr: 749 },
  year: { usd: 90, inr: 7499 },
} as const;

export type LedgerKind =
  | "welcome"
  | "pack"
  | "pro_grant"
  | "pro_expire"
  | "pro_reversal"
  | "review"
  | "review_refund"
  | "figure"
  | "figure_refund"
  | "reversal"
  | "reinstated"
  | "admin";

/**
 * Unspent Pro coins, walking the ledger oldest first. Pro coins are spent
 * before any others (they're the ones that can lapse). A refund goes back to
 * the coins it was paid with (matched by its ref), so abandoning a review
 * can't turn lapsing Pro coins into lasting ones. A reversed pack takes pack
 * coins first; a reversed Pro payment, Pro coins first.
 */
export function proCoinsLeft(entries: { kind: LedgerKind; delta: number; ref: string }[]): number {
  let pro = 0;
  let other = 0;
  const paidWithPro = new Map<string, number>(); // a charge's ref -> how much of it was Pro coins
  const take = (amount: number, proFirst: boolean) => {
    const fromPro = proFirst ? Math.max(0, Math.min(pro, amount)) : Math.max(0, amount - Math.max(0, Math.min(other, amount)));
    pro -= fromPro;
    other -= amount - fromPro;
    return fromPro;
  };
  for (const { kind, delta, ref } of entries) {
    if (kind === "pro_grant" || kind === "pro_expire") pro += delta;
    else if (kind === "review_refund" || kind === "figure_refund") {
      const back = Math.min(delta, paidWithPro.get(ref) ?? 0);
      pro += back;
      other += delta - back;
      paidWithPro.set(ref, (paidWithPro.get(ref) ?? 0) - back);
    } else if (delta > 0) other += delta;
    else if (kind === "reversal") take(-delta, false);
    else if (kind === "pro_reversal") take(-delta, true);
    else paidWithPro.set(ref, (paidWithPro.get(ref) ?? 0) + take(-delta, true));
  }
  // Never more Pro coins than coins: a deficit elsewhere (a reversed payment) comes out of them too.
  return Math.max(0, Math.min(pro, pro + other));
}

export type ProPeriod = { id: string; interval: "month" | "year"; periodStart: number; periodEnd: number; active: boolean };

/** Calendar months after `t`, clamped to the month's last day (Jan 31 + 1 = Feb 28). */
function addMonths(t: number, n: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/**
 * The monthly grants this billing period has earned by `now`, as ledger refs
 * (inserting one that exists already fails on UNIQUE, so callers just try
 * each). A monthly plan earns one per period; a yearly one, one a month.
 */
export function dueProGrants(p: ProPeriod, now: number): string[] {
  if (!p.active) return [];
  const months = p.interval === "year" ? 12 : 1;
  const refs: string[] = [];
  for (let m = 0; m < months; m++) {
    const start = addMonths(p.periodStart, m);
    if (start > now || start >= p.periodEnd) break;
    refs.push(`${p.id}:${p.periodStart}:${m}`);
  }
  return refs;
}

/** How an address is stored: trimmed, lower-cased. */
export const normalEmail = (email: string) => email.trim().toLowerCase();

/** One address per person, for the once-only welcome bonus: no +tags, and Gmail ignores dots. */
export function canonicalEmail(email: string): string {
  const [local, domain] = normalEmail(email).split("@");
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  const bare = local.split("+")[0];
  return `${gmail ? bare.replaceAll(".", "") : bare}@${gmail ? "gmail.com" : domain}`;
}

export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const LABELS: Record<LedgerKind, string> = {
  welcome: "Welcome bonus",
  pack: "Coin pack",
  pro_grant: "Pro monthly coins",
  pro_expire: "Pro coins over the carry-over limit",
  review: "Pre-submission review",
  review_refund: "Refund: part of a review that didn't run",
  figure: "Ask Claude (figure)",
  figure_refund: "Refund: figure request failed",
  reversal: "Payment refunded or reversed",
  pro_reversal: "Pro payment refunded or reversed",
  reinstated: "Disputed payment settled: coins restored",
  admin: "Adjustment",
};
export const ledgerLabel = (kind: LedgerKind) => LABELS[kind];

export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in to use this.");
    this.name = "SignInRequiredError";
  }
}

export class NotEnoughCoinsError extends Error {
  coins: number;
  balance: number;
  constructor(coins: number, balance: number) {
    super(`This costs ${coins} M coin${coins === 1 ? "" : "s"} and you have ${balance}.`);
    this.name = "NotEnoughCoinsError";
    this.coins = coins;
    this.balance = balance;
  }
}
