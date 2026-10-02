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

// A page, its payload for Next's router (/home.txt) and everything under
// its folder (/home/__next.home.__PAGE__.txt, /journal/S1).
const under = (path: string, p: string) => path === p || path === `${p}.txt` || path.startsWith(`${p}/`);

export function pageNeeds(path: string): Need {
  if (under(path, "/admin")) return "developer";
  if (!BETA.on) return "public";
  // A file in a page's folder that isn't one of its payloads (the guide's
  // screenshots) is no page: served without asking the database.
  if (/\.(?!txt$)[a-z0-9]+$/i.test(path)) return "public";
  return GATED.some((p) => under(path, p)) ? "approved" : "public";
}

/** public/_routes.json: the API, and every gated page, payload and folder. */
export function routesJson() {
  const pages = BETA.on ? GATED : ["/admin"];
  return { version: 1, include: ["/api/*", ...pages.flatMap((p) => [p, `${p}.txt`, `${p}/*`])], exclude: [] as string[] };
}

// The /* block of public/_headers. Pages doesn't apply that file to a
// Function's response, so the gate sets these on the pages it lets through.
export const PAGE_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self \"https://buy.paddle.com\" \"https://sandbox-buy.paddle.com\"), usb=(), serial=(), bluetooth=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.paddle.com https://challenges.cloudflare.com https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev; connect-src 'self' blob: https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev https://*.paddle.com https://challenges.cloudflare.com; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-src 'self' blob: https://*.paddle.com https://challenges.cloudflare.com; img-src 'self' data: blob: https://*.paddle.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
