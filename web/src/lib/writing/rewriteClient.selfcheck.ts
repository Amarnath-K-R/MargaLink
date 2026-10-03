// Runnable check for rewriteClient.ts, with fetch stubbed: the request goes
// out exactly as built, each refusal comes back as what the page shows, and
// an answer is checked again here before it's offered.
//   node src/lib/writing/rewriteClient.selfcheck.ts
import assert from "node:assert/strict";
import { requestRewrite } from "./rewriteClient.ts";
import { rewriteWords, type RewriteRequest } from "./rewrite.ts";
import { rewritePrice, NotEnoughCoinsError, SignInRequiredError } from "../accounts/coins.ts";

const passage = "Sleep was shorter ⟦1⟧ after surgery.";
const req: RewriteRequest = { tool: "paraphrase", tone: null, format: "text", dialect: "us", passage, coins: rewritePrice(rewriteWords(passage)) };
let sent: { url: string; init: RequestInit }[] = [];
const reply = (body: BodyInit | null, status = 200, type = "application/json") => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(body, { status, headers: { "content-type": type } });
  }) as typeof fetch;
};

reply(JSON.stringify({ text: "Sleep was briefer ⟦1⟧ after surgery.", notes: [], coins: 1, balance: 41 }));
assert.deepEqual(await requestRewrite(req), { text: "Sleep was briefer ⟦1⟧ after surgery.", notes: [], balance: 41 });
assert.equal(sent[0].url, "/api/rewrite");
assert.equal(sent[0].init.method, "POST");
assert.deepEqual(JSON.parse(String(sent[0].init.body)), req, "the request, exactly");

// refusals, as the page shows them
reply("Sign in to use Rewrite.", 401, "text/plain");
await assert.rejects(requestRewrite(req), SignInRequiredError);
reply(JSON.stringify({ coins: 1, balance: 0 }), 402);
await assert.rejects(requestRewrite(req), (e: unknown) => e instanceof NotEnoughCoinsError && e.coins === 1 && e.balance === 0);
reply("Rewrite is fully booked for today. Try again tomorrow; nothing was charged.", 429, "text/plain;charset=UTF-8");
await assert.rejects(requestRewrite(req), /fully booked/);
reply("Claude couldn't be reached. Your coin was refunded. Try again in a moment.", 502, "text/plain;charset=UTF-8");
await assert.rejects(requestRewrite(req), /refunded/);
reply("<html>Bad gateway</html>", 502, "text/html");
await assert.rejects(requestRewrite(req), (e: unknown) => e instanceof Error && !/html/i.test(e.message) && /refunded/.test(e.message), "a host's error page isn't shown");

// an answer that breaks a rule isn't offered, whatever the server said
reply(JSON.stringify({ text: "Sleep was briefer after surgery.", notes: [], coins: 1, balance: 40 }));
await assert.rejects(requestRewrite(req), /can't be used/);

// a request the server would refuse isn't sent
sent = [];
await assert.rejects(requestRewrite({ ...req, coins: 9 }), /price/);
assert.equal(sent.length, 0, "nothing sent");

console.log("rewriteClient.selfcheck: OK");
