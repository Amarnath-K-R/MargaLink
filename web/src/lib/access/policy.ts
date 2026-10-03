// Which pages and API routes need what while the beta runs. Pure, so the
// page gate (functions/_middleware.ts) and the API gate
// (functions/api/_middleware.ts) share one answer, and public/_routes.json,
// the list of paths that run a Function at all, is generated from it
// (policy.selfcheck.ts keeps the two equal). The gate on pages is for the
// visitor; what protects the AI features and the accounts is the API gate.
import { BETA } from "./beta.ts";

export type Need = "public" | "approved" | "developer";

// The dashboard and every tool. The landing page, sign-in, and the legal,
// contact and team pages stay public.
export const GATED = ["/home", "/match", "/journals", "/journal", "/review", "/figures", "/write", "/guide", "/architecture", "/account", "/pricing", "/admin"];

// A page (and its .html spelling), its payload for Next's router
// (/home.txt) and everything under its folder
// (/home/__next.home.__PAGE__.txt, /journal/S1).
const under = (path: string, p: string) => path === p || path === `${p}.txt` || path === `${p}.html` || path.startsWith(`${p}/`);

// The one spelling a path is judged in. Pages routes a Function whatever the
// case and with or without a trailing slash, and a server may decode an
// escape or fold a doubled slash, so each variant is read as the path it
// can reach. Reading too much into a path can only gate more, never less.
function canonical(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(p);
  } catch {
    // a malformed escape: judged as written
  }
  return p.toLowerCase().replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
}

export function pageNeeds(raw: string): Need {
  const path = canonical(raw);
  if (under(path, "/admin")) return "developer";
  if (!BETA.on) return "public";
  // A file in a page's folder that isn't one of its payloads (the guide's
  // screenshots) is no page: served without asking the database.
  if (/\.(?!txt$|html$)[a-z0-9]+$/.test(path)) return "public";
  return GATED.some((p) => under(path, p)) ? "approved" : "public";
}

// The API: the AI features need an invited account, the console a
// developer. Everything else needs only what its handler asks (usually a
// session), so export, deletion and sign-out never depend on the list.
export function apiNeeds(raw: string): Need {
  const path = canonical(raw);
  if (path.startsWith("/api/admin/")) return "developer";
  if (!BETA.on) return "public";
  return path === "/api/review" || path.startsWith("/api/review/") || path === "/api/figure" || path === "/api/rewrite" ? "approved" : "public";
}

// The static files no page is made of, which never need a Function: the
// app's scripts and styles, the journal index, fonts, templates, the
// figure gallery, and the workers (the figure worker has a stricter CSP of
// its own in _headers, which a Function would drop).
const ASSETS = [
  "/_next/*",
  "/index/*",
  "/fonts/*",
  "/templates/*",
  "/figure-gallery/*",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/opengraph-image",
  "/robots.txt",
  "/sitemap.xml",
  "/texWorker.js",
  "/figureWorker.mjs",
  "/figurelib.py",
];

/**
 * public/_routes.json: which requests run a Function at all. While the beta
 * runs, all but the static assets: a static server may answer another
 * spelling of a page (/HOME, /h%6Fme) with its file, so every spelling must
 * pass the gate, which reads it canonically. After the beta, only the API
 * and the console.
 */
export function routesJson() {
  return BETA.on
    ? { version: 1, include: ["/*"], exclude: ASSETS }
    : { version: 1, include: ["/api/*", "/admin", "/admin.txt", "/admin/*"], exclude: [] as string[] };
}

// The /* block of public/_headers. Pages doesn't apply that file to a
// Function's response, so the gate sets these on every page it serves.
export const PAGE_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self \"https://buy.paddle.com\" \"https://sandbox-buy.paddle.com\"), usb=(), serial=(), bluetooth=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.paddle.com https://challenges.cloudflare.com https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev; connect-src 'self' blob: https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev https://*.paddle.com https://challenges.cloudflare.com; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-src 'self' blob: https://*.paddle.com https://challenges.cloudflare.com; img-src 'self' data: blob: https://*.paddle.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
