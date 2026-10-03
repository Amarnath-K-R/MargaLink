// Runnable check for policy.ts and the page gate (functions/_middleware.ts):
// which paths need what, that public/_routes.json and the gate's security
// headers match the policy and public/_headers, and the gate's answers to
// the signed out, the uninvited, testers and developers. On node:sqlite.
//   node src/lib/access/policy.selfcheck.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, signInUser, SESSION_COOKIE } from "../accounts/auth.ts";
import { BETA } from "./beta.ts";
import { addAccess, admitUser } from "./access.ts";
import { apiNeeds, PAGE_HEADERS, pageNeeds, routesJson } from "./policy.ts";
import { onRequest as gate } from "../../../functions/_middleware.ts";

// --- the policy
const table: [string, string][] = [
  ["/", "public"],
  ["/index.txt", "public"],
  ["/signin", "public"],
  ["/signin/verify", "public"],
  ["/privacy", "public"],
  ["/terms", "public"],
  ["/refunds", "public"],
  ["/contact", "public"],
  ["/team", "public"],
  ["/_next/static/chunks/app.js", "public"],
  ["/index/meta.json", "public"],
  ["/figureWorker.mjs", "public"],
  ["/homework", "public"],
  ["/journalsx", "public"],
  ["/guide/coins-account.jpg", "public"], // a screenshot in the guide's folder, not the guide
  ["/home", "approved"],
  ["/home/", "approved"],
  ["/home.txt", "approved"],
  ["/home/__next.home.__PAGE__.txt", "approved"],
  ["/journals", "approved"],
  ["/journal/S100014455", "approved"],
  ["/journal/S100014455.txt", "approved"],
  ["/match", "approved"],
  ["/review", "approved"],
  ["/figures", "approved"],
  ["/write", "approved"],
  ["/guide", "approved"],
  ["/architecture", "approved"],
  ["/account", "approved"],
  ["/pricing", "approved"],
  ["/admin", "developer"],
  ["/admin.txt", "developer"],
  // the spellings a router or an asset server may treat as the same page
  ["/HOME", "approved"],
  ["/Home/", "approved"],
  ["/home.html", "approved"],
  ["/journal/S100014455.html", "approved"],
  ["/h%6Fme", "approved"],
  ["//home", "approved"],
  ["/Admin", "developer"],
];
for (const [path, need] of table) assert.equal(pageNeeds(path), need, path);

// the API: Pages routes a Function whatever the case and with or without a trailing slash, so the gate must too
const apiTable: [string, string][] = [
  ["/api/me", "public"],
  ["/api/account", "public"],
  ["/api/reviews", "public"],
  ["/api/review", "approved"],
  ["/api/review/start", "approved"],
  ["/api/figure", "approved"],
  ["/api/rewrite", "approved"],
  ["/api/Rewrite/", "approved"],
  ["/api/rewriter", "public"],
  ["/api/figure/", "approved"],
  ["/api/Figure", "approved"],
  ["/API/REVIEW/start", "approved"],
  ["/api/review/start/", "approved"],
  ["/api/admin/stats", "developer"],
  ["/api/Admin/stats/", "developer"],
];
for (const [path, need] of apiTable) assert.equal(apiNeeds(path), need, path);

// which paths run a Function at all: the committed _routes.json is the policy's. While the beta runs,
// everything does but the static asset folders (a static server may answer /HOME or /h%6Fme with
// home.html, so no spelling of a page may skip the gate), and nothing excluded is a page that's gated.
const routes = JSON.parse(readFileSync(new URL("../../../public/_routes.json", import.meta.url), "utf8"));
assert.deepEqual(routes, routesJson(), `public/_routes.json is out of date; it should be:\n${JSON.stringify(routesJson(), null, 2)}`);
assert.ok(routes.include.length + routes.exclude.length <= 100, "Pages allows 100 rules");
assert.deepEqual(routes.include, ["/*"]);
assert.ok(routes.exclude.includes("/_next/*") && routes.exclude.includes("/index/*") && routes.exclude.includes("/figureWorker.mjs"));
for (const ex of routes.exclude) assert.equal(pageNeeds(ex.replace("/*", "/x")), "public", `${ex} is excluded, so it must not be gated`);

// the gate sets the same security headers public/_headers gives static pages
const block = readFileSync(new URL("../../../public/_headers", import.meta.url), "utf8").split(/^\/\*$/m)[1].split(/\n\s*\n/)[0];
const fileHeaders = Object.fromEntries(
  block
    .trim()
    .split("\n")
    .map((l) => [l.trim().slice(0, l.trim().indexOf(": ")), l.trim().slice(l.trim().indexOf(": ") + 2)]),
);
assert.deepEqual(PAGE_HEADERS, fileHeaders, "PAGE_HEADERS must match the /* block of public/_headers");
assert.match(PAGE_HEADERS["Content-Security-Policy"], /frame-ancestors 'none'/);

// with the beta off: every page public again, except the console
(BETA as { on: boolean }).on = false;
assert.equal(pageNeeds("/home"), "public");
assert.equal(pageNeeds("/admin"), "developer");
assert.deepEqual(routesJson().include, ["/api/*", "/admin", "/admin.txt", "/admin/*"]);
(BETA as { on: boolean }).on = true;

// --- the gate
const db = testD1();
const now = Date.now();
let served = 0;
const page = () => (served++, new Response("the page", { headers: { "content-type": "text/html" } }));
type Ctx = { request: Request; env: { DB?: D1Database }; next: () => Promise<Response>; data: Record<string, unknown> };
const visit = (path: string, token?: string, env: Ctx["env"] = { DB: db }) =>
  (gate as unknown as (c: Ctx) => Promise<Response>)({
    request: new Request(`https://margalink.com${path}`, { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} }),
    env,
    next: async () => page(),
    data: {},
  });

// the API passes straight through, untouched (it has its own gate and headers)
for (const path of ["/api/me", "/api/review/start", "/API/Figure"]) {
  const before = served;
  const r = await visit(path);
  assert.deepEqual([r.status, served - before, r.headers.get("cache-control"), r.headers.get("content-security-policy")], [200, 1, null, null], path);
}
// public pages are served, with the security headers _headers would have given them (Pages skips that file once a Function runs), cached as usual
for (const path of ["/", "/privacy", "/guide/coins-account.jpg", "/no-such-page"]) {
  const before = served;
  const r = await visit(path);
  assert.deepEqual([r.status, served - before, r.headers.get("cache-control")], [200, 1, null], path);
  assert.equal(r.headers.get("content-security-policy"), PAGE_HEADERS["Content-Security-Policy"], path);
}
// any spelling of a gated page is gated
for (const path of ["/HOME", "/h%6Fme", "//home", "/Journal/S1.html"]) assert.equal((await visit(path)).status, 302, path);

// signed out: to the sign-in page, coming back after; a payload gets a bare 401 (the router then loads the page)
let r = await visit("/journal/S1?from=match");
assert.deepEqual([r.status, r.headers.get("location")], [302, "/signin?next=%2Fjournal%2FS1%3Ffrom%3Dmatch"]);
r = await visit("/home.txt?_rsc=abc");
assert.equal(r.status, 401);
r = await visit("/home", undefined, {});
assert.equal(r.status, 302, "no database: closed, not open");

// signed in, but not on the list
const legacy = await signInUser(db, { email: "old@x.org" }, now);
r = await visit("/home", await createSession(db, legacy.id, now));
assert.deepEqual([r.status, r.headers.get("location")], [302, "/signin?error=not-approved"]);

// a tester: the page, with the security headers, cached nowhere shared; but not the console
await addAccess(db, [{ email: "ann@x.org", role: "beta" }, { email: "dev@x.org", role: "developer" }], null, now);
const ann = (await admitUser(db, { email: "ann@x.org" }, now, "key"))!;
const annToken = await createSession(db, ann.id, now);
const before = served;
r = await visit("/review", annToken);
assert.deepEqual([r.status, await r.text(), served - before], [200, "the page", 1]);
assert.equal(r.headers.get("content-security-policy"), PAGE_HEADERS["Content-Security-Policy"]);
assert.equal(r.headers.get("x-frame-options"), "DENY");
assert.equal(r.headers.get("cache-control"), "private, no-cache");
assert.equal(r.headers.get("content-type"), "text/html", "the page's own headers stay");
r = await visit("/admin", annToken);
assert.deepEqual([r.status, r.headers.get("location")], [302, "/home"]);
assert.equal((await visit("/admin.txt", annToken)).status, 401);
assert.equal(served - before, 1, "nothing served past the gate");

// a developer: the console
const dev = (await admitUser(db, { email: "dev@x.org" }, now, "key"))!;
r = await visit("/admin", await createSession(db, dev.id, now));
assert.equal(r.status, 200);

console.log("policy.selfcheck: OK");
