"use client";

import { useEffect, useState } from "react";

export type NetworkCall = { method: string; url: string; hadBody: boolean };

// The requests that carried text the person agreed to send: the AI features'
// (review, Ask Claude, Rewrite). The review's ticket carries only lengths.
export const sentCount = (calls: NetworkCall[]) => calls.filter((c) => c.hadBody && /\/api\/(review|figure|rewrite)(\?|$)/.test(c.url)).length;

// Instruments fetch for the page's lifetime, so /write's status line can
// count the requests that carried a body (what was sent, if anything)
// whenever they fire, whichever tool window sent them.
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

  return { calls };
}
