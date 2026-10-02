// The closed beta's one switch. While it's on, only addresses on the access
// list may sign in, the dashboard and the tools need an approved account
// (policy.ts, functions/_middleware.ts), and new accounts start with
// BETA.coins in place of the usual welcome coins (accounts/coins.ts).
// Turning it off makes the tools public again; commit the smaller
// public/_routes.json that policy.selfcheck then asks for. No imports: the
// browser bundle and the Functions both read it.
export const BETA = { on: true, coins: 50 };
