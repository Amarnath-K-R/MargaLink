/** Where to go after signing in: a path on this site, or `fallback`. Never another origin. Shared by the Functions and the sign-in pages. */
export function safeNext(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string" || next.length > 512 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  const u = new URL(next, "https://margalink.invalid");
  return u.origin === "https://margalink.invalid" ? u.pathname + u.search + u.hash : fallback;
}
