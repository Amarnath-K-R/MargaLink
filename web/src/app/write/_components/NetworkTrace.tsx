"use client";

import { useCallback, useEffect, useState } from "react";

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
