"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type NetworkCall = { method: string; url: string; hadBody: boolean };

// Instruments fetch for the whole component lifetime, not just one run —
// real proof, not a claim, that nothing leaves the tab unlogged, no matter
// when a request happens to fire. Shared by /match and /review, the two
// pages whose entire privacy claim rests on this being checkable on the
// page itself, not just asserted in CLAUDE.md.
export function useNetworkTrace() {
  const [calls, setCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input.toString();
      setCalls((prev) => [...prev, { method: init?.method ?? "GET", url, hadBody: Boolean(init?.body) }]);
      return originalFetch(...args);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Stable identity (like a useState setter) so callers can list it in a
  // useCallback dependency array without that callback being recreated
  // every render.
  const resetCalls = useCallback(() => setCalls([]), []);
  return { calls, resetCalls };
}

// `children` is the trailing sentence — it differs per page (match reasons
// about whether any request carried a body at all; review reasons about
// the one request that's expected to, once consent is given), so it's the
// caller's to write, not this component's.
export function NetworkTracePanel({
  calls,
  className = "mt-10 rounded-sm border border-line bg-paper-alt p-4 text-sm",
  children,
}: {
  calls: NetworkCall[];
  className?: string;
  children: ReactNode;
}) {
  if (calls.length === 0) return null;
  return (
    <div className={className}>
      <p className="mb-2 font-medium">Network requests made during this run</p>
      <ul className="space-y-1 font-mono text-xs text-ink-soft">
        {calls.map((c, i) => (
          <li key={i}>
            {c.method} {c.url} — {c.hadBody ? "had a body" : "no body sent"}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-soft">{children}</p>
    </div>
  );
}
