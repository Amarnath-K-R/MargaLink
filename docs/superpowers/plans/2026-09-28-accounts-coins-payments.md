# Accounts, M coins and payments (and finishing matching v2 in parallel)

## Context

MargaLink's tools are built and themed. What's missing to run it as a product is **who is using it,
and who pays for the parts that cost money**. The two AI features cost real money per use (a review
~$0.12–0.32, up to ~$1.7 for a 400k-character thorough one; an Ask Claude figure request ~$0.02–0.04)
and today they are limited only by localStorage counters (3 free reviews, 5 free figure requests per
device, trivially reset) plus a global daily cap in KV. There are no accounts, no database and no
payments. The privacy page already promises "accounts will need only an email address" and "payment
details stay with the payment provider".

**Owner's decisions (2026-09-28):**
1. **Sign-in:** Continue with Google, plus a one-time **email sign-in link** for people without Google.
   The link is the email verification; Google already verifies its addresses.
2. **Payments:** a merchant of record, **Paddle Billing** (seller in India, buyers global; Paddle sells,
   files VAT/GST, invoices and refunds). Lemon Squeezy's future after Stripe bought it is uncertain.
3. **M coins:** every AI action costs coins. Coins come from a **one-time welcome bonus** (10 M coins),
   **one-off packs**, and **Pro** (monthly/yearly) that tops up coins each month. No monthly free allowance.
4. **Accounts only for the AI features.** Matching, checks, figures (drawn locally) and writing stay
   open with no sign-in, and anonymous visitors make no new requests at all.

**Outcome:** a signed-in researcher sees their M coin balance in the tray; sees the exact price of a
review or an Ask Claude request in its consent notice before anything is sent; is charged exactly once,
on the server, with automatic refunds when a run fails; can buy packs or subscribe through Paddle's
checkout; and can see their history, manage Pro, export their data or delete their account. Nothing
from a paper is ever stored, as before.

In parallel (owner's request): **finish matching v2** now that the OpenAlex fetch is done (19,144
journals in `pipeline/data/works_v2.jsonl`, finished 2026-09-26).

---

## Key design decisions

| Topic | Decision | Why |
|---|---|---|
| Database | **Cloudflare D1** (SQLite), `web/migrations/*.sql`, binding `DB` in the existing `web/wrangler.toml` | KV is eventually consistent (1 write/s/key): double-spends. D1 statements are atomic, writes serialized, `batch()` is a transaction, UNIQUE/CHECK do idempotency |
| Balance | **Append-only `coin_ledger`, balance = `SUM(delta)`**, no cached column | A debit is one conditional `INSERT … SELECT … WHERE SUM >= cost`: no race, nothing to drift; `UNIQUE(kind, ref)` makes every credit idempotent |
| Google | Hand-rolled OIDC code flow + PKCE + `state` (~40 lines), **no JWKS check**, scope `openid email` | The id_token comes straight from Google's token endpoint over TLS for our secret + verifier (OIDC Core §3.1.3.7). Require `iss`, `aud`, `exp`, `email_verified` |
| Name | **Not stored**; email only | Keeps the privacy page's "only an email address" promise |
| Sessions | Opaque 32-byte token in `__Host-ml_session` (HttpOnly, Secure, SameSite=Lax, 30 days rolling); only its sha256 in D1 | Revocable, sign-out-everywhere, nothing useful leaks from a DB dump |
| Anonymous visitors | A non-secret `ml_in=1` hint cookie; **no `/api/me` call without it** | The network tab stays exactly as today for signed-out users |
| Signing in mid-task | Google in a **popup**, email link in a new tab; the page picks up the session on focus | A redirect would throw away a loaded paper, dataset or figure |
| CSRF | SameSite=Lax + `functions/api/_middleware.ts` rejecting non-GET requests whose `Origin` isn't ours (webhook exempt) | Simple, complete for a same-origin API |
| Review charging | `POST /api/review/start` debits and returns an **opaque ticket backed by a D1 row** (bound to tier, chunk ids + lengths, pass budget, 2 h expiry); every pass sends `X-Review-Ticket` | Stopping replay needs a D1 counter per pass anyway, so a signature adds nothing but a secret |
| Refunds | A ticket that expires without a successful synthesis is **refunded in full automatically** (lazy sweep); Resume/Retry reuse the ticket and never re-charge; a failed Ask Claude call is refunded at once | Users never pay for a run that didn't finish |
| Pro grants | Granted lazily by the webhook and `/api/me` (no cron); yearly plans drip monthly; carry-over capped | No scheduler needed on Pages |

---

## Pricing (all numbers in `web/src/lib/coins.ts` and the Paddle dashboard)

**What things cost** (`reviewPrice(tier, chars)`, shared by client and server; `chars` = what will actually be sent):

| Tier | 30k chars | 75k | 150k | 400k |
|---|---|---|---|---|
| Quick (4 + 2 per extra 50k) | 4 | 6 | 8 | 18 |
| Standard (6 + 3 per extra 50k) | 6 | 9 | 12 | 27 |
| Thorough (10 + 5 per extra 50k) | 10 | 15 | 20 | 45 |

Ask Claude (spec or custom tweak): **1 M coin**. Welcome bonus: **10 M coins** (one standard review of a short paper, or ten figure requests).

**What coins cost:**

| Product | USD | INR | M coins |
|---|---|---|---|
| Pack S | $6 | ₹499 | 50 |
| Pack M | $15 | ₹1,249 | 150 |
| Pack L | $36 | ₹2,999 | 400 |
| Pro monthly | $9/mo | ₹749/mo | 100/month, carry-over up to 100 |
| Pro yearly | $90/yr | ₹7,499/yr | 100/month |

Margins after Paddle (~5% + $0.50) and 18% tax-inclusive pricing: worst case 1.5x (yearly Pro in INR,
every coin spent on the densest thorough reviews), typically ≥2.2x; welcome coins cost ≤$0.40 per account.
Pack coins never expire; Pro coins beyond the carry-over cap lapse.

**M coins are a closed-system prepaid instrument** (usable only on MargaLink, no cash value, not
transferable, refundable only per the refund policy or law, forfeited on account deletion), which needs
no RBI authorisation. The Terms call them "usage credits", never a wallet.

---

## Architecture

### Endpoints (Pages Functions under `web/functions/api/`)

| Endpoint | Purpose |
|---|---|
| `_middleware.ts` | Origin check on non-GET (webhook exempt), `Cache-Control: no-store` |
| `GET me` | `{user:{id,email}|null, balance, pro, paddle:{env,token}}`; rolls the session; runs the sweep, the welcome grant and due Pro grants |
| `GET auth/google/start`, `GET auth/google/callback` | OIDC code flow; one redirect URI per environment (`GOOGLE_REDIRECT_URI`); previews get no Google ("use an email link") |
| `POST auth/email/request`, `POST auth/email/verify` | Magic link: sha256-stored token, 15 min, single use (`DELETE … RETURNING`); link carries the token in the URL fragment and the page asks "Sign in as x@y" before POSTing (email scanners can't burn it); identical 200s (no enumeration); limits 3/15 min + 10/day per email, 10/h per IP, 90/day global (Resend free tier); dev: `DEV_EMAIL_LOG=1` on localhost prints the link |
| `POST auth/logout` | `{all?:true}` signs out everywhere |
| `GET account[?download=1]`, `POST account {delete:"<email>"}` | Export; delete (typing the email; cancels Pro at Paddle first; FK cascade) |
| `POST review/start` | Validate `{tier, journalId, chunks:[{id,chars}]}`, check the daily cap before charging, debit + create ticket in one batch; `402 {coins,balance}` if short |
| `POST review` (existing) | Requires `X-Review-Ticket`; claims one pass from the ticket (tier, declared chunk id, length ≤ paid, budget `2n+2` extracts / 4 syntheses) before the upstream call; marks `synthesized` after a synthesis 200 |
| `POST figure` (existing) | Session required; debit 1 coin before the upstream call; refund on any non-200 after it; returns `balance` |
| `POST pay/webhook` | Paddle signature (HMAC-SHA256 over `ts:rawBody`, ±300 s, any `h1`); event id recorded in the same batch as its effects; `transaction.completed` → pack coins by server-side price id; `subscription.*` upsert guarded by `event_at`; `adjustment.*` refunds/chargebacks → `reversal` |
| `POST pay/portal` | Paddle customer-portal session URL for managing Pro |

### Data (`web/migrations/0001_accounts.sql`, `0002_payments.sql`, `0003_subscriptions.sql`)

`users(id, email UNIQUE, notice_version, created_at)` · `identities(provider, subject, user_id)` ·
`sessions(id_hash, user_id, expires_at)` · `magic_links(token_hash, email, next, expires_at)` ·
`rate_limits(key, count, expires_at)` · `coin_ledger(user_id, delta, kind, ref, created_at, UNIQUE(kind,ref))`
with kinds `welcome, pack, pro_grant, pro_expire, review, review_refund, figure, figure_refund, reversal, admin` ·
`review_tickets(id_hash, user_id, tier, coins, chunks JSON of ids→lengths, extract_left, synth_left, synthesized, expires_at)` ·
`payment_events(id, type, received_at)` · `subscriptions(id, user_id, customer_id, price_id, status, period_start, period_end, cancel_at_end, event_at)`.
Foreign keys cascade on account deletion. Nothing in the database holds paper content; a ticket holds
section ids and character counts only, deleted within ~2 hours.

### Client

- `src/lib/coins.ts` (prices, packs, `reviewPrice`, `proCarry`, `dueProGrants`, `canonicalEmail`, `ledgerLabel`, `SignInRequiredError`, `NotEnoughCoinsError`), `src/lib/auth.ts` (server-side helpers), `src/lib/ledger.ts` (SQL), `src/lib/paddle.ts` (signature, `planPaddleEvent`, API) and `src/lib/paddleCheckout.ts` (Paddle.js loaded only on Buy).
- Remove the localStorage counters (`FREE_REVIEWS_PER_DEVICE`, `FREE_FIGURES_PER_DEVICE`, `recordReviewUsed`, `ReviewLimitError`, `FigureLimitError`, `ReviewState.counted`); `runReview` sends the ticket; `useReview` keeps it across Resume/Retry.
- `src/components/useAccount.ts` (module store + `useSyncExternalStore`, fetches `/api/me` only with `ml_in`, revalidates on focus), `AccountButton.tsx` (coin bead + balance in the `PageHeader` tray and the landing header; "Sign in" when signed out), `SignInPanel.tsx`.

### Pages and touchpoints (clay design system, all client-rendered, no em dashes)

- `/signin` (Google button, email link, "Check your email"), `/signin/verify` ("Sign in as x@y"), `/account` (balance, history, plan, Manage subscription, sign out / everywhere, download my data, delete), `/pricing` (costs with worked examples, packs, Pro), `/terms`, `/refunds`; `public/_headers` sets `X-Frame-Options: DENY` on `/account*` and `/signin*`.
- **ReviewConsent:** "This review costs 9 M coins; you have 42. If it doesn't finish, the coins come back automatically within 2 hours." Confirm reads "Send it and review (9 M coins)"; not enough coins → disabled with a Buy link (opens `/pricing` in a new tab so the paper stays loaded). ReviewRunner's button shows the price, or "Sign in to get a review".
- **Describe/FigureConsent:** "1 M coin per request · you have 41. A request that fails is refunded."; signed out: "Sign in to ask Claude (new accounts get 10 M coins)."
- **Home** shows the balance ("42 M coins · Buy coins · Account") or a sign-in invitation. The workspace windows inherit all of this (same components).
- **Workspace status line:** count only `/api/(review|figure)` requests with a body (otherwise `review/start` and `logout` would read as "text you agreed to send").

### Copy and legal

- **Privacy page** "Accounts and payment" becomes an itemized DPDP/GDPR notice: what is kept (email, Google id, hashed sessions, coin history, Paddle ids, notice version), kept briefly (a running review's ticket, hashed-IP rate counters), never kept (paper content, names, card numbers), why, how long, rights (export/delete on `/account`), grievance contact, processors (Cloudflare, Resend, Google, Paddle as merchant of record, Anthropic). The three rules are unchanged.
- **CLAUDE.md:** server code is no longer "only two Functions": name the account and payment Functions and state none ever receives paper content; env table gains `DB`, `GOOGLE_CLIENT_ID/_SECRET`, `GOOGLE_REDIRECT_URI`, `RESEND_API_KEY`, `EMAIL_FROM`, `PADDLE_ENV`, `PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `DEV_EMAIL_LOG`.
- **ARCHITECTURE.md** section "Accounts, coins and payments"; **guide** section (sign in, costs, buying, Pro, automatic refunds, deleting) with screenshots; **What's new** entry; sitemap adds `/pricing`, `/terms`, `/refunds`.

---

## What the owner must set up (blocks going live, not building)

1. **A real domain** on the Pages project (OAuth, Resend and Paddle need a stable HTTPS origin); set `NEXT_PUBLIC_SITE_URL`; redirect `margalink.pages.dev` to it.
2. **D1:** `wrangler d1 create margalink --location apac` (+ `margalink-preview`); ids into `wrangler.toml`.
3. **Google Cloud:** OAuth web client (redirect URIs for production and `http://localhost:8788`), consent screen with `openid email` only, published, brand verification.
4. **Resend:** verified sending domain (SPF/DKIM/DMARC), tracking off.
5. **Paddle:** sandbox + live accounts, the products/prices above with INR overrides, approved domain, default payment link `/pricing`, webhook destinations (transaction.completed, subscription.created/updated/canceled, adjustment.created/updated) per environment, an API key. Live approval needs pricing, terms, privacy and refund pages live.
6. **Secrets** per environment (dashboard or `wrangler pages secret put`); local values in `.dev.vars`.
7. **Tax/accounting:** a CA on Paddle payouts as export of services (LUT, FIRA) and GST.

Everything can be built and tested before this: selfchecks run on Node's built-in SQLite, the smokes mock the APIs, and `wrangler pages dev` with local D1 and `DEV_EMAIL_LOG=1` runs the real Functions end to end.

---

## Tasks (one commit each; `npm run check` green; smokes for touched flows; never merge to main)

**Phase 1: accounts, welcome coins, server-side charging**
1. **D1 scaffolding:** `migrations/0001_accounts.sql`, `wrangler.toml` (`DB`, `[env.preview]`), `package.json` (`@types/node` ≥24; `db:local`, `dev:full` scripts), `src/lib/testD1.ts` (a ~25-line D1 shim over `node:sqlite` for selfchecks).
2. **Coin logic:** `src/lib/coins.ts` + `coins.selfcheck.ts` (price table, `proCarry`, `dueProGrants`, `canonicalEmail`).
3. **Auth core:** `src/lib/auth.ts`, `functions/api/_middleware.ts`, `auth.selfcheck.ts` (`safeNext` rejects `//evil`, `/\evil`, `https:`, `javascript:`; id-token claims; cookie attributes; sessions; account linking both directions; Origin check).
4. **Sign-in endpoints:** `auth/google/{start,callback}`, `auth/email/{request,verify}`, `auth/logout`, `me`; `src/lib/ledger.ts` (balance, welcome, sweep).
5. **Account endpoint:** `account.ts` (export, delete with cascade).
6. **Review charging:** `review/start.ts`, ticket claims in `review.ts`, `DAILY_PASS_CAP` moved to `reviewPasses.ts`, `reviewTicket.selfcheck.ts` (401/402/403, budget, refund-once across two sweeps, never below zero). If Pages rejects `review.ts` beside a `review/` folder, move it to `review/index.ts`.
7. **Figure charging:** `figure.ts` + `figureEndpoint.selfcheck.ts` (401, 402, refund on failure, balance returned).
8. **Client plumbing:** `review.ts`, `reviewOrchestrator.ts`, `figure.ts` (counters removed, ticket header, 401/403 fatal) + their selfchecks.
9. **Account UI shell:** `useAccount.ts`, `AccountButton.tsx`, `SignInPanel.tsx`, `PageHeader.tsx`, `_home/SiteHeader.tsx`, Home, the Workspace `sent` filter.
10. **Pages:** `/signin`, `/signin/verify`, `/account`, `public/_headers`.
11. **Charging UI:** `useReview.ts`, `ReviewRunner.tsx`, `ReviewConsent.tsx`, `FigureConsent.tsx`, `Describe.tsx`, `scripts/mock_account.mjs`; `check_review`, `check_write`, `check_figures` sign in through the mock.
12. **Phase 1 copy:** privacy page, `/terms`, sitemap, CLAUDE.md; re-shoot the guide's tray/review/figures.

**Phase 2: coin packs** 13. Webhook (`0002_payments.sql`, `src/lib/paddle.ts`, `pay/webhook.ts`, `paddle.selfcheck.ts`: signature vs a `node:crypto` oracle, idempotency, refund reversal). 14. Checkout (`paddleCheckout.ts`, `/pricing`, `/refunds`, Buy links).

**Phase 3: Pro** 15. `0003_subscriptions.sql`, `grantDuePro`, subscription upsert, `pay/portal.ts`, cancel-before-delete. 16. Pro on `/pricing` and `/account`.

**Phase 4** 17. `scripts/e2e_accounts.mjs` (real Functions via `wrangler pages dev`: email sign-in from the dev log, signed sandbox webhook, a ticketed review with mocked passes, 402, logout). 18. Guide section + screenshots, What's new, ARCHITECTURE.md, README.

---

## Parallel workstream: finish matching v2 (runs in the background meanwhile)

From `pipeline/` on the same branch, one step at a time, checking processes with `ps aux` (never `pgrep -f`) and never launching a second copy:
1. `nohup caffeinate -i uv run build_index.py >> <scratchpad>/build_index_v2.log 2>&1 & disown` (~7 h).
2. Set `quality.COHERENCE_FLOOR` from its printed percentiles (gte-small cosines are compressed; interim p1 was 0.875); hand-check `data/dropped.txt`; rebuild if the floor changed.
3. `uv run fetch_heldout_refs.py`, then `node scripts/eval_match.ts --refs --fit --write-manifest`; put the final ladder in ARCHITECTURE.md.
4. Manual gate: the two real test papers' journals in the top 10; `check_match`, `check_filters`, `check_journal_page`, `check_journals_browse`; re-shoot the guide's match screenshots.
5. Commit the manifest/docs; deploy only when the owner says so (the accounts work changes deployment needs: D1 bindings and secrets).

---

## Verification

- **Every task:** `npm run check` (typecheck, lint, all selfchecks including the new D1-backed ones on `node:sqlite`).
- **Flows:** `check_account.mjs` (anonymous makes no `/api/me` request; email flow to "Check your email"; verify page; Google popup path; `/account` history and delete confirmation; Buy with a stubbed Paddle.js firing `checkout.completed`; a review sends `X-Review-Ticket` on every pass and the balance drops; too few coins disables confirm and shows Buy); updated `check_review`, `check_write`, `check_figures`; `check_match` still asserts zero requests with a body.
- **End to end:** `e2e_accounts.mjs` against `npm run dev:full` with local D1.
- **Copy:** `_scan.mjs` over every page (new ones included) finds no em dashes; `check_docs.mjs`.
- **Live (after owner setup):** preview deployment with Paddle sandbox: email sign-in, a test-card pack credits once, a sandbox refund reverses it, a sandbox subscription grants 100 immediately and once per renewal, the portal opens.

## Risks and how they're handled

Webhook forgery or replay (HMAC + timestamp + event id in the same transaction) · balance races (one
conditional insert, serialized writes) · paying for passes never run or replaying them (ticket bound to
tier, chunks, budget, expiry; ceiling ~2x noted) · welcome-coin farming (canonical-email ref, per-IP and
daily caps, small bonus; Turnstile next if needed) · chargebacks (reversal row; a negative balance blocks
spending) · Indian recurring-card mandates (renewals may fail; packs stay reliable) · previews touching
production (separate D1, Paddle sandbox, no Google) · log hygiene (never log emails, tokens or bodies) ·
D1 outage (AI features fail closed; local tools unaffected).

---

## Amendments after the whole-branch review (2026-09-28)

A fresh review of the finished branch found one critical, four important and ten minor problems; all
were fixed on the branch (cee73e2..5a8e064). What changed from the plan above:

- **Review refunds are for what wasn't delivered, not the whole run.** A ticket that expired without a
  synthesis used to be refunded in full, which made every section's analysis free for a client that
  never asked for the cross-check. A review is now priced in parts (one per section, one for the
  cross-check) and the sweep refunds the parts that didn't come back (`review_deliveries`). No pass
  starts within five minutes of a ticket's end. All user-facing copy says so.
- **Fingerprints are HMACs** with a new secret, `HASH_SECRET` (not plain sha256).
- **Email sign-in** limits count an IPv6 /64 as one network, and only addresses without an account draw
  on the daily budget; optional Cloudflare Turnstile (`TURNSTILE_SECRET`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
- **Magic links carry only the token**; the verify page asks the server which address it's for.
- **Refund accounting** (`0005_refund_accounting.sql`): `pro_reversal` and `reinstated` ledger kinds, an
  `adjustments` table, Pro periods worth their unrefunded share, bucket-aware `proCoinsLeft`, race-free
  reversals, pack quantities, won disputes.
- **Housekeeping** in `_middleware.ts` (at most once a minute) instead of lazy sweeps only.
- **Site-wide** `X-Frame-Options: DENY`; a blocked Google popup no longer redirects away from a paper.

### Second audit (same day)

Three more audits (an attacker's view, a randomized money simulation over the real handlers, and the pages'
promises against the code) found one more critical gap and several smaller ones; all fixed:

- **A review's price and what it buys are bound together.** The ticket's pass budget was shared across
  sections, so one large section plus many one-character ones bought hundreds of passes of the large one for
  a few coins. Now a section that came back isn't sent again, each section gets at most four tries
  (`0006_review_tries.sql`), and refunds weigh sections by length (the cross-check like an average section),
  rounded up so any part that didn't come back returns at least a coin.
- **Checkout is signed**: custom_data carries the account's signature, so nobody can buy coins onto someone
  else's account.
- **Email sign-in limits** count per address and network, so a stranger can't lock anyone out.
- **Webhooks that arrive early** (a refund before its purchase, a won dispute before its chargeback) are
  answered 503 so Paddle retries; the Pro-coin count never exceeds the balance; credits to a just-deleted
  account are dropped.
- **Promises kept**: the privacy page lists purchase records and says Paddle event ids are kept 90 days (and
  housekeeping deletes them after); the data export includes everything stored; deleting an account with Pro
  warns that Pro ends at once; plain error messages throughout.

