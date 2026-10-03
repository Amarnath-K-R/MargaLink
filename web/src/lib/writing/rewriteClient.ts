// The browser's side of Rewrite: one request to /api/rewrite
// (functions/api/rewrite.ts), its refusals turned into what the page shows,
// and the answer checked again here, by the same rules (rewrite.ts), before
// anything is offered. fetch is looked up at call time, so /write's network
// trace sees the request.
import { NotEnoughCoinsError, SignInRequiredError } from "../accounts/coins.ts";
import { checkRewrite, parseRewriteRequest, type RewriteRequest, type Rewritten } from "./rewrite.ts";

const FAILED = "Claude didn't answer. Try again in a moment; a rewrite that fails is refunded.";

export async function requestRewrite(req: RewriteRequest): Promise<Rewritten & { balance: number | null }> {
  const refused = parseRewriteRequest(req);
  if (typeof refused === "string") throw new Error(refused);
  const res = await fetch("/api/rewrite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  if (res.status === 401) throw new SignInRequiredError();
  if (res.status === 402) {
    const { coins, balance } = (await res.json()) as { coins: number; balance: number };
    throw new NotEnoughCoinsError(coins, balance);
  }
  if (!res.ok) {
    // Our Functions answer in plain words; a host's error page isn't shown.
    const words = (res.headers.get("content-type") ?? "").includes("html") ? "" : await res.text().catch(() => "");
    throw new Error(words && words.length <= 400 ? words : FAILED);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const answer = data && checkRewrite(req, { text: data.text, notes: data.notes });
  if (!answer || typeof answer === "string") throw new Error("The rewrite that came back can't be used. Try again.");
  return { ...answer, balance: typeof data.balance === "number" ? data.balance : null };
}
