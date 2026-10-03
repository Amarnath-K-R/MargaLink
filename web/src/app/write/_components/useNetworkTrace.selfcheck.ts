// Runnable check for sentCount: the requests /write's status line counts as
// having carried text the person agreed to send.
//   node src/app/write/_components/useNetworkTrace.selfcheck.ts
import assert from "node:assert/strict";
import { sentCount } from "./useNetworkTrace.ts";

const call = (url: string, hadBody = true) => ({ method: "POST", url, hadBody });
assert.equal(sentCount([call("/api/review"), call("/api/figure"), call("/api/rewrite"), call("http://localhost:3000/api/rewrite?x=1")]), 4, "each AI feature's requests");
assert.equal(sentCount([call("/api/review/start"), call("/api/me", false), call("/api/rewrite", false), call("/api/rewriter")]), 0, "not the ticket (lengths only), not a bodyless call, not another route");
console.log("useNetworkTrace.selfcheck: OK");
